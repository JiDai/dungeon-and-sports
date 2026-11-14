-- Édition des compétences, pour soi seul.
--
-- Chaque joueur a déjà sa propre copie des exercices (default_exercise n'est qu'un modèle, copié par
-- seed_exercises) : modifier une ligne de exercise ne touche que lui. Pour qu'une modification ne casse pas le
-- lien avec le modèle, chaque copie retient son modèle d'origine dans default_id :
--  - les migrations qui ajoutent des exercices de départ repèrent « déjà présent » par default_id, plus par le
--    nom de quête (qu'un joueur peut désormais changer) ;
--  - « revenir au modèle » recopie le modèle sur un exercice modifié.
-- L'historique ne bouge pas : activity garde le nom, le détail et l'XP du jour de la validation.

alter table public.exercise add column default_id integer references public.default_exercise on delete set null;

-- Personne n'a pu modifier un exercice jusqu'ici : une copie d'un modèle lui est encore identique.
update public.exercise e set default_id = d.id
from public.default_exercise d
where e.default_id is null and d.category = e.category and d.flavor = e.flavor and d.name = e.name;

create or replace function public.seed_exercises(p_player uuid) returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into exercise (player_id, category, flavor, name, detail, xp, position, default_id)
  select p_player, category, flavor, name, detail, xp, position, id from default_exercise order by category, position;
$$;

/** Modifie un exercice actif du joueur. Les quêtes déjà validées gardent leurs anciennes valeurs. */
create function public.update_exercise(p_player uuid, p_exercise bigint, p_flavor text, p_name text, p_detail text, p_xp integer)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform assert_player(p_player);
  if nullif(trim(p_name), '') is null then
    raise exception 'Donne au moins un nom à l''exercice' using errcode = 'P0001';
  end if;
  update exercise set
    flavor = coalesce(nullif(trim(p_flavor), ''), flavor),
    name = trim(p_name),
    detail = trim(coalesce(p_detail, '')),
    xp = p_xp
  where id = p_exercise and player_id = p_player and archived_at is null;
  if not found then
    raise exception 'Exercice inconnu' using errcode = 'P0001';
  end if;
end;
$$;

/** Remet un exercice issu d'un modèle aux valeurs de ce modèle. */
create function public.reset_exercise(p_player uuid, p_exercise bigint) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform assert_player(p_player);
  update exercise e set flavor = d.flavor, name = d.name, detail = d.detail, xp = d.xp
  from default_exercise d
  where e.id = p_exercise and e.player_id = p_player and e.archived_at is null and d.id = e.default_id;
  if not found then
    raise exception 'Cet exercice n''a pas de modèle' using errcode = 'P0001';
  end if;
end;
$$;

revoke execute on function public.update_exercise(uuid, bigint, text, text, text, integer) from public, anon;
revoke execute on function public.reset_exercise(uuid, bigint) from public, anon;
grant execute on function public.update_exercise(uuid, bigint, text, text, text, integer) to service_role, authenticated;
grant execute on function public.reset_exercise(uuid, bigint) to service_role, authenticated;

-- get_carnet : chaque exercice dit s'il vient d'un modèle et s'il en diffère.
create or replace function public.get_carnet(p_player uuid, p_chronicle_limit integer default 100) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  p player := assert_player(p_player);
  today date := player_today(p);
begin
  perform ensure_draws(p.id);
  return jsonb_build_object(
    'player', jsonb_build_object('id', p.id, 'name', p.name, 'title', p.title, 'timeZone', p.time_zone),
    'today', today,
    'yesterday', today - 1,
    'progress', (
      select jsonb_build_object('totalXp', total_xp, 'level', level, 'xp', xp_in_level, 'xpForNextLevel', xp_for_next_level,
                                'pendingRewards', pending_rewards)
      from player_progress where player_id = p.id),
    'stats', (select jsonb_object_agg(category, points) from player_stats where player_id = p.id),
    'questBonus', 10,
    'exercises', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'category', e.category, 'flavor', e.flavor, 'name', e.name,
                                          'detail', e.detail, 'xp', e.xp, 'fromDefault', d.id is not null,
                                          'modified', d.id is not null
                                            and (d.flavor, d.name, d.detail, d.xp) is distinct from (e.flavor, e.name, e.detail, e.xp))
                       order by c.position, e.position, e.id)
      from exercise e join category_def c using (category) left join default_exercise d on d.id = e.default_id
      where e.player_id = p.id and e.archived_at is null), '[]'),
    'draws', (
      select jsonb_object_agg(d.category, d.exercise_id) from daily_draw d where d.player_id = p.id and d.day = today),
    -- Ce qui est déjà validé aujourd'hui et hier : quêtes par catégorie, et « steps » pour les pas.
    'done', jsonb_build_object(
      'today', coalesce((select jsonb_agg(case when kind = 'steps' then 'steps' else category::text end order by id) from activity
                         where player_id = p.id and day = today and kind in ('quest', 'catch_up', 'steps')), '[]'),
      'yesterday', coalesce((select jsonb_agg(case when kind = 'steps' then 'steps' else category::text end order by id) from activity
                             where player_id = p.id and day = today - 1 and kind in ('quest', 'catch_up', 'steps')), '[]')),
    -- Les exercices déjà validés aujourd'hui et hier (quête ou choix libre).
    'doneExercises', jsonb_build_object(
      'today', coalesce((select jsonb_agg(exercise_id order by id) from activity
                         where player_id = p.id and day = today and kind in ('quest', 'exercise') and exercise_id is not null), '[]'),
      'yesterday', coalesce((select jsonb_agg(exercise_id order by id) from activity
                             where player_id = p.id and day = today - 1 and kind in ('quest', 'exercise') and exercise_id is not null), '[]')),
    'rerollAvailable', reroll_available(p),
    'wishlists', (
      select jsonb_object_agg(t.tier, coalesce((
        select jsonb_agg(w.label order by w.position, w.id) from wishlist_item w where w.player_id = p.id and w.tier = t.tier), '[]'))
      from reward_tier_def t),
    'cagnotte', jsonb_build_object(
      'total', (select total from cagnotte_balance where player_id = p.id),
      'entries', coalesce((
        select jsonb_agg(jsonb_build_object('id', id, 'label', label, 'amount', amount, 'at', created_at) order by created_at desc, id desc)
        from cagnotte_entry where player_id = p.id and cashout_id is null), '[]')),
    'weights', coalesce((
      select jsonb_agg(jsonb_build_object('day', day, 'weightKg', weight_kg) order by day)
      from weight_entry where player_id = p.id), '[]'),
    'chronicle', coalesce((
      select jsonb_agg(to_jsonb(c) - 'player_id' order by c.at desc, c.kind desc)
      from (select * from chronicle where player_id = p.id order by at desc, kind desc limit p_chronicle_limit) c), '[]')
  );
end;
$$;

-- Export : le modèle d'origine de chaque exercice (default_ref).
create or replace function public.export_player(p_player uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  p player := assert_player(p_player);
begin
  return jsonb_build_object(
    'app', 'carnet-de-cendres',
    'format', 2,
    'exportedAt', now(),
    'player', jsonb_build_object('name', p.name, 'title', p.title, 'time_zone', p.time_zone,
                                 'legacy_rewards_claimed', p.legacy_rewards_claimed),
    'exercises', coalesce((select jsonb_agg(jsonb_build_object('ref', id, 'category', category, 'flavor', flavor, 'name', name,
        'detail', detail, 'xp', xp, 'position', position, 'archived_at', archived_at, 'created_at', created_at,
        'default_ref', default_id) order by id)
      from exercise where player_id = p.id), '[]'),
    'draws', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'category', category, 'exercise_ref', exercise_id,
        'drawn_at', drawn_at) order by day, category)
      from daily_draw where player_id = p.id), '[]'),
    'activities', coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'day', day, 'category', category,
        'exercise_ref', exercise_id, 'exercise_name', exercise_name, 'exercise_detail', exercise_detail, 'steps', steps,
        'xp', xp, 'stat_points', stat_points, 'late', late, 'created_at', created_at) order by created_at, id)
      from activity where player_id = p.id), '[]'),
    'reward_draws', coalesce((select jsonb_agg(jsonb_build_object('ref', id, 'day', day, 'tier', tier, 'name', name,
        'description', description, 'is_reroll', is_reroll, 'replaces_ref', replaces_id, 'created_at', created_at) order by id)
      from reward_draw where player_id = p.id), '[]'),
    'wishlist', coalesce((select jsonb_agg(jsonb_build_object('tier', tier, 'label', label, 'position', position) order by tier, position, id)
      from wishlist_item where player_id = p.id), '[]'),
    'cagnotte_cashouts', coalesce((select jsonb_agg(jsonb_build_object('ref', id, 'description', description, 'total', total,
        'created_at', created_at) order by id)
      from cagnotte_cashout where player_id = p.id), '[]'),
    'cagnotte_entries', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'amount', amount, 'cashout_ref', cashout_id,
        'created_at', created_at) order by id)
      from cagnotte_entry where player_id = p.id), '[]'),
    'weights', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'weight_kg', weight_kg, 'created_at', created_at) order by day)
      from weight_entry where player_id = p.id), '[]'),
    'legacy_log', coalesce((select jsonb_agg(jsonb_build_object('date_label', date_label, 'text', text, 'xp', xp,
        'created_at', created_at) order by created_at, id)
      from legacy_log_entry where player_id = p.id), '[]')
  );
end;
$$;

-- Import : default_ref s'il désigne un modèle existant ; sinon (anciens exports) le modèle identique.
create or replace function public.import_player(p_player uuid, p_data jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r jsonb;
  new_id bigint;
  exercise_ids jsonb := '{}';
  draw_ids jsonb := '{}';
  cashout_ids jsonb := '{}';
begin
  if (p_data ->> 'format')::integer is distinct from 2 then
    raise exception 'Format d''export inconnu' using errcode = '22023';
  end if;
  perform clear_player(p_player);

  update player set
    name = coalesce(p_data #>> '{player,name}', ''),
    title = coalesce(p_data #>> '{player,title}', ''),
    time_zone = coalesce(p_data #>> '{player,time_zone}', time_zone),
    legacy_rewards_claimed = coalesce((p_data #>> '{player,legacy_rewards_claimed}')::integer, 0)
  where id = p_player;

  for r in select * from jsonb_array_elements(coalesce(p_data -> 'exercises', '[]')) loop
    insert into exercise (player_id, category, flavor, name, detail, xp, position, archived_at, created_at, default_id)
    values (p_player, (r ->> 'category')::category, r ->> 'flavor', r ->> 'name', coalesce(r ->> 'detail', ''),
            (r ->> 'xp')::integer, coalesce((r ->> 'position')::integer, 0), (r ->> 'archived_at')::timestamptz,
            coalesce((r ->> 'created_at')::timestamptz, now()),
            coalesce(
              (select d.id from default_exercise d where d.id = (r ->> 'default_ref')::integer),
              case when not (r ? 'default_ref') then
                (select d.id from default_exercise d
                 where d.category = (r ->> 'category')::category and d.flavor = r ->> 'flavor' and d.name = r ->> 'name')
              end))
    returning id into new_id;
    exercise_ids := exercise_ids || jsonb_build_object(r ->> 'ref', new_id);
  end loop;
  if not exists (select 1 from exercise where player_id = p_player) then
    perform seed_exercises(p_player);
  end if;

  insert into daily_draw (player_id, day, category, exercise_id, drawn_at)
  select p_player, (j ->> 'day')::date, (j ->> 'category')::category, (exercise_ids ->> (j ->> 'exercise_ref'))::bigint,
         coalesce((j ->> 'drawn_at')::timestamptz, now())
  from jsonb_array_elements(coalesce(p_data -> 'draws', '[]')) j
  where exercise_ids ? (j ->> 'exercise_ref');

  insert into activity (player_id, kind, day, category, exercise_id, exercise_name, exercise_detail, steps, xp, stat_points, late, created_at)
  select p_player, (j ->> 'kind')::activity_kind, (j ->> 'day')::date, (j ->> 'category')::category,
         (exercise_ids ->> (j ->> 'exercise_ref'))::bigint, j ->> 'exercise_name', j ->> 'exercise_detail',
         (j ->> 'steps')::integer, (j ->> 'xp')::integer, coalesce((j ->> 'stat_points')::integer, 0),
         coalesce((j ->> 'late')::boolean, (j ->> 'kind') = 'catch_up'),
         coalesce((j ->> 'created_at')::timestamptz, now())
  from jsonb_array_elements(coalesce(p_data -> 'activities', '[]')) with ordinality as t (j, ord)
  order by ord;

  for r in select * from jsonb_array_elements(coalesce(p_data -> 'reward_draws', '[]')) loop
    insert into reward_draw (player_id, day, tier, name, description, is_reroll, replaces_id, created_at)
    values (p_player, (r ->> 'day')::date, (r ->> 'tier')::reward_tier, r ->> 'name', r ->> 'description',
            coalesce((r ->> 'is_reroll')::boolean, false), (draw_ids ->> (r ->> 'replaces_ref'))::bigint,
            coalesce((r ->> 'created_at')::timestamptz, now()))
    returning id into new_id;
    if r ? 'ref' then draw_ids := draw_ids || jsonb_build_object(r ->> 'ref', new_id); end if;
  end loop;

  insert into wishlist_item (player_id, tier, label, position)
  select p_player, (j ->> 'tier')::reward_tier, j ->> 'label', coalesce((j ->> 'position')::integer, 0)
  from jsonb_array_elements(coalesce(p_data -> 'wishlist', '[]')) j;

  for r in select * from jsonb_array_elements(coalesce(p_data -> 'cagnotte_cashouts', '[]')) loop
    insert into cagnotte_cashout (player_id, description, total, created_at)
    values (p_player, coalesce(r ->> 'description', ''), (r ->> 'total')::numeric, coalesce((r ->> 'created_at')::timestamptz, now()))
    returning id into new_id;
    if r ? 'ref' then cashout_ids := cashout_ids || jsonb_build_object(r ->> 'ref', new_id); end if;
  end loop;

  insert into cagnotte_entry (player_id, label, amount, cashout_id, created_at)
  select p_player, j ->> 'label', (j ->> 'amount')::numeric, (cashout_ids ->> (j ->> 'cashout_ref'))::bigint,
         coalesce((j ->> 'created_at')::timestamptz, now())
  from jsonb_array_elements(coalesce(p_data -> 'cagnotte_entries', '[]')) j;

  insert into weight_entry (player_id, day, weight_kg, created_at)
  select p_player, (j ->> 'day')::date, (j ->> 'weight_kg')::numeric, coalesce((j ->> 'created_at')::timestamptz, now())
  from jsonb_array_elements(coalesce(p_data -> 'weights', '[]')) j;

  insert into legacy_log_entry (player_id, date_label, text, xp, created_at)
  select p_player, j ->> 'date_label', j ->> 'text', (j ->> 'xp')::integer, (j ->> 'created_at')::timestamptz
  from jsonb_array_elements(coalesce(p_data -> 'legacy_log', '[]')) j;
end;
$$;

notify pgrst, 'reload schema';
