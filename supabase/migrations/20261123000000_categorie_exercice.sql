-- Changer la catégorie d'un exercice, depuis sa fiche de modification.
--
-- L'exercice passe en fin de liste dans sa nouvelle catégorie. Comme pour un retrait, chaque catégorie garde
-- au moins un exercice. S'il était la quête du jour de son ancienne catégorie et qu'elle n'est pas encore
-- validée, une autre quête y est tirée ; validée, elle reste telle quelle.
-- L'historique ne bouge pas : activity garde la catégorie du jour de la validation (stats comprises).
-- « Revenir au modèle » remet aussi la catégorie du modèle, et un changement de catégorie compte comme une
-- modification.

/** Déplace un exercice actif du joueur dans une autre catégorie (sans effet si c'est déjà la sienne). */
create function public.move_exercise(p_player uuid, p_exercise bigint, p_category public.category) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  p player := assert_player(p_player);
  today date := player_today(p);
  ex exercise;
begin
  select * into ex from exercise where id = p_exercise and player_id = p.id and archived_at is null for update;
  if not found then
    raise exception 'Exercice inconnu' using errcode = 'P0001';
  end if;
  if ex.category = p_category then return; end if;
  if (select count(*) from exercise where player_id = p.id and category = ex.category and archived_at is null) <= 1 then
    raise exception 'Garde au moins un exercice par catégorie' using errcode = 'P0001';
  end if;
  update exercise set
    category = p_category,
    position = (select coalesce(max(position), 0) + 1 from exercise where player_id = p.id and category = p_category)
  where id = ex.id;
  -- Quête du jour pas encore validée dans l'ancienne catégorie : ensure_draws en tire une autre.
  delete from daily_draw d
  where d.player_id = p.id and d.day = today and d.category = ex.category and d.exercise_id = ex.id
    and not exists (select 1 from activity a where a.player_id = p.id and a.day = today and a.category = ex.category
                                              and a.kind in ('quest', 'catch_up'));
  perform ensure_draws(p.id);
end;
$$;

revoke execute on function public.move_exercise(uuid, bigint, public.category) from public, anon, authenticated;

-- update_exercise prend la catégorie (null : inchangée).
drop function public.update_exercise(uuid, bigint, text, text, text, integer);

/** Modifie un exercice actif du joueur. Les quêtes déjà validées gardent leurs anciennes valeurs. */
create function public.update_exercise(p_player uuid, p_exercise bigint, p_category public.category, p_flavor text, p_name text,
                                       p_detail text, p_xp integer)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform assert_player(p_player);
  if nullif(trim(p_name), '') is null then
    raise exception 'Donne au moins un nom à l''exercice' using errcode = 'P0001';
  end if;
  if p_category is not null then
    perform move_exercise(p_player, p_exercise, p_category);
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

/** Remet un exercice issu d'un modèle aux valeurs de ce modèle, catégorie comprise. */
create or replace function public.reset_exercise(p_player uuid, p_exercise bigint) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  model_category category;
begin
  perform assert_player(p_player);
  select d.category into model_category
  from exercise e join default_exercise d on d.id = e.default_id
  where e.id = p_exercise and e.player_id = p_player and e.archived_at is null;
  if not found then
    raise exception 'Cet exercice n''a pas de modèle' using errcode = 'P0001';
  end if;
  perform move_exercise(p_player, p_exercise, model_category);
  update exercise e set flavor = d.flavor, name = d.name, detail = d.detail, xp = d.xp
  from default_exercise d
  where e.id = p_exercise and e.player_id = p_player and d.id = e.default_id;
end;
$$;

revoke execute on function public.update_exercise(uuid, bigint, public.category, text, text, text, integer) from public, anon;
grant execute on function public.update_exercise(uuid, bigint, public.category, text, text, text, integer) to service_role, authenticated;

-- get_carnet : « modified » tient compte de la catégorie.
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
                                            and (d.category, d.flavor, d.name, d.detail, d.xp) is distinct from (e.category, e.flavor, e.name, e.detail, e.xp))
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
        select jsonb_agg(jsonb_build_object('id', w.id, 'label', w.label, 'amount', w.amount) order by w.position, w.id)
        from wishlist_item w where w.player_id = p.id and w.tier = t.tier and w.archived_at is null), '[]'))
      from reward_tier_def t),
    'wonRewards', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'day', d.day, 'tier', d.tier, 'name', d.name,
                                          'description', d.description, 'amount', d.amount, 'at', d.created_at)
                       order by d.created_at desc, d.id desc)
      from reward_draw d
      where d.player_id = p.id and d.outcome is null
        and not exists (select 1 from reward_draw r where r.replaces_id = d.id)), '[]'),
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

notify pgrst, 'reload schema';
