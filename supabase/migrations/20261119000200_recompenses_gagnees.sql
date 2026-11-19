-- Refonte des récompenses (JID-193).
--
-- La liste de souhaits devient une vraie liste : chaque élément a un montant « cagnottable », et le retirer
-- l'archive (les tirages passés gardent leur lien). Un tirage n'est plus seulement noté : il attend une
-- décision du joueur, qui le prend (outcome taken) ou le met dans la cagnotte (outcome banked, une entrée de
-- cagnotte du montant de l'élément). Une fois décidé, le tirage du jour ne peut plus être retiré.
-- L'ajout libre à la cagnotte disparaît : elle ne se remplit plus qu'avec des récompenses gagnées.

create type public.reward_outcome as enum ('taken', 'banked');

alter table public.wishlist_item
  add column amount      numeric(10, 2) check (amount > 0),
  add column archived_at timestamptz;

alter table public.reward_draw
  add column wishlist_item_id bigint references public.wishlist_item on delete set null,
  add column amount           numeric(10, 2) check (amount > 0),
  add column outcome          public.reward_outcome,
  add column decided_at       timestamptz,
  add constraint reward_draw_decided check ((outcome is null) = (decided_at is null));

alter table public.cagnotte_entry
  add column reward_draw_id bigint unique references public.reward_draw on delete set null;

-- Les tirages d'avant n'attendaient aucune décision : on les tient pour pris.
update public.reward_draw set outcome = 'taken', decided_at = created_at;

/* ---------- Liste de souhaits ---------- */

drop function public.set_wishlist(uuid, public.reward_tier, text[]);
drop function public.add_to_cagnotte(uuid, text, numeric);

create function public.add_wishlist_item(p_player uuid, p_tier public.reward_tier, p_label text, p_amount numeric)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform assert_player(p_player);
  if nullif(trim(p_label), '') is null then
    raise exception 'Donne un nom à la récompense' using errcode = 'P0001';
  end if;
  insert into wishlist_item (player_id, tier, label, amount, position)
  values (p_player, p_tier, trim(p_label), p_amount,
          coalesce((select max(position) from wishlist_item where player_id = p_player and tier = p_tier), 0) + 1);
end;
$$;

/** Modifie un élément actif. Les tirages déjà faits gardent leur libellé et leur montant. */
create function public.update_wishlist_item(p_player uuid, p_item bigint, p_label text, p_amount numeric) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform assert_player(p_player);
  if nullif(trim(p_label), '') is null then
    raise exception 'Donne un nom à la récompense' using errcode = 'P0001';
  end if;
  update wishlist_item set label = trim(p_label), amount = p_amount
  where id = p_item and player_id = p_player and archived_at is null;
  if not found then
    raise exception 'Récompense inconnue' using errcode = 'P0001';
  end if;
end;
$$;

create function public.archive_wishlist_item(p_player uuid, p_item bigint) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform assert_player(p_player);
  update wishlist_item set archived_at = now() where id = p_item and player_id = p_player and archived_at is null;
  if not found then
    raise exception 'Récompense inconnue' using errcode = 'P0001';
  end if;
end;
$$;

/* ---------- Tirage et décision ---------- */

/** Retirage possible : le dernier tirage du jour attend encore une décision, et aucun retirage aujourd'hui. */
create or replace function public.reroll_available(p public.player) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select outcome is null from reward_draw where player_id = p.id and day = player_today(p)
                   order by created_at desc, id desc limit 1), false)
     and not exists (select 1 from reward_draw where player_id = p.id and day = player_today(p) and is_reroll);
$$;

/** Lance le dé : consomme une montée de niveau, ou remplace la dernière récompense du jour (p_reroll). */
create or replace function public.draw_reward(p_player uuid, p_reroll boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  p player := assert_player(p_player);
  today date := player_today(p);
  roll numeric := random();
  t reward_tier_def;
  chosen reward_tier_def;
  item wishlist_item;
  replaced bigint;
  drawn reward_draw;
begin
  -- Sérialise les lancers d'un même joueur (double clic, plusieurs onglets).
  perform 1 from player where id = p.id for update;
  if p_reroll then
    if not reroll_available(p) then
      raise exception 'Pas de retirage disponible' using errcode = 'P0001';
    end if;
    select id into replaced from reward_draw where player_id = p.id and day = today order by created_at desc, id desc limit 1;
  elsif (select pending_rewards from player_progress where player_id = p.id) <= 0 then
    raise exception 'Aucune montée de niveau à récompenser' using errcode = 'P0001';
  end if;

  for t in select * from reward_tier_def order by position loop
    chosen := t;
    roll := roll - t.weight;
    exit when roll < 0;
  end loop;

  select * into item from wishlist_item
  where player_id = p.id and tier = chosen.tier and archived_at is null order by random() limit 1;
  insert into reward_draw (player_id, day, tier, name, description, wishlist_item_id, amount, is_reroll, replaces_id)
  values (p.id, today, chosen.tier, chosen.flavors[1 + floor(random() * cardinality(chosen.flavors))::integer], item.label,
          item.id, item.amount, p_reroll, replaced)
  returning * into drawn;
  return jsonb_build_object('id', drawn.id, 'tier', drawn.tier, 'name', drawn.name, 'description', drawn.description,
                            'amount', drawn.amount);
end;
$$;

/** Verrouille un tirage gagné qui attend encore une décision (ni décidé, ni remplacé par un retirage). */
create function public.pending_draw(p_player uuid, p_draw bigint) returns public.reward_draw
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  d reward_draw;
begin
  perform assert_player(p_player);
  select * into d from reward_draw where id = p_draw and player_id = p_player for update;
  if not found or d.outcome is not null
     or exists (select 1 from reward_draw r where r.replaces_id = d.id) then
    raise exception 'Cette récompense n''attend plus de décision' using errcode = 'P0001';
  end if;
  return d;
end;
$$;

create function public.take_reward(p_player uuid, p_draw bigint) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform pending_draw(p_player, p_draw);
  update reward_draw set outcome = 'taken', decided_at = clock_timestamp() where id = p_draw;
end;
$$;

create function public.bank_reward(p_player uuid, p_draw bigint) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  d reward_draw := pending_draw(p_player, p_draw);
begin
  if d.amount is null then
    raise exception 'Cette récompense n''a pas de montant à cagnotter' using errcode = 'P0001';
  end if;
  update reward_draw set outcome = 'banked', decided_at = clock_timestamp() where id = d.id;
  insert into cagnotte_entry (player_id, label, amount, reward_draw_id, created_at)
  values (p_player, coalesce(d.description, d.name), d.amount, d.id, clock_timestamp());
end;
$$;

revoke execute on function public.add_wishlist_item(uuid, public.reward_tier, text, numeric) from public, anon;
revoke execute on function public.update_wishlist_item(uuid, bigint, text, numeric) from public, anon;
revoke execute on function public.archive_wishlist_item(uuid, bigint) from public, anon;
revoke execute on function public.pending_draw(uuid, bigint) from public, anon, authenticated;
revoke execute on function public.take_reward(uuid, bigint) from public, anon;
revoke execute on function public.bank_reward(uuid, bigint) from public, anon;
grant execute on function public.add_wishlist_item(uuid, public.reward_tier, text, numeric) to service_role, authenticated;
grant execute on function public.update_wishlist_item(uuid, bigint, text, numeric) to service_role, authenticated;
grant execute on function public.archive_wishlist_item(uuid, bigint) to service_role, authenticated;
grant execute on function public.take_reward(uuid, bigint) to service_role, authenticated;
grant execute on function public.bank_reward(uuid, bigint) to service_role, authenticated;

/* ---------- Chronique ---------- */

-- Deux lignes de plus par tirage décidé : « prise » ou « cagnottée ». L'entrée de cagnotte qui vient d'un
-- tirage n'apparaît pas une seconde fois en cagnotte_add.
create or replace view public.chronicle with (security_invoker = true) as
with cumulated as (
  select a.*, sum(a.xp) over (partition by a.player_id order by a.created_at, a.id) as cum_xp
  from public.activity a
)
select
  a.player_id, a.created_at as at, a.day, 'activity'::text as kind, a.kind::text as activity_kind, a.category,
  a.exercise_name as name, a.exercise_detail as detail, a.steps, a.xp, null::integer as level,
  null::public.reward_tier as tier, null::boolean as is_reroll, null::numeric as amount,
  a.late, null::text as date_label
from cumulated a
where a.kind <> 'opening_balance'
union all
select
  a.player_id, a.created_at, a.day, 'level_up', null, null, null, null, null, null, public.level_for_xp(a.cum_xp),
  null, null, null, null, null
from cumulated a
where a.kind <> 'opening_balance' and public.level_for_xp(a.cum_xp) > public.level_for_xp(a.cum_xp - a.xp)
union all
select d.player_id, d.created_at, d.day, 'reward', null, null, d.name, d.description, null, null, null,
  d.tier, d.is_reroll, d.amount, null, null
from public.reward_draw d
union all
select d.player_id, d.decided_at, null, 'reward_' || d.outcome::text, null, null, d.name, d.description, null, null, null,
  d.tier, null, d.amount, null, null
from public.reward_draw d
-- Les tirages d'avant la refonte ont été « pris » d'office (decided_at = created_at) : pas de ligne pour eux.
-- Une vraie décision est datée par clock_timestamp(), donc toujours après le tirage.
where d.outcome is not null and d.decided_at <> d.created_at
union all
select e.player_id, e.created_at, null, 'cagnotte_add', null, null, e.label, null, null, null, null,
  null, null, e.amount, null, null
from public.cagnotte_entry e
where e.reward_draw_id is null
union all
select c.player_id, c.created_at, null, 'cagnotte_cashout', null, null, null, c.description, null, null, null,
  null, null, c.total, null, null
from public.cagnotte_cashout c
union all
select l.player_id, l.created_at, null, 'legacy', null, null, null, l.text, null, l.xp, null,
  null, null, null, null, l.date_label
from public.legacy_log_entry l;

/* ---------- Lecture ---------- */

-- get_carnet : la liste de souhaits porte id et montant ; wonRewards liste les tirages à décider.
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

/* ---------- Export et import ---------- */

-- Export : montants, archivage et issue des tirages ; lien des entrées de cagnotte à leur tirage.
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
        'description', description, 'wishlist_ref', wishlist_item_id, 'amount', amount, 'outcome', outcome,
        'decided_at', decided_at, 'is_reroll', is_reroll, 'replaces_ref', replaces_id, 'created_at', created_at) order by id)
      from reward_draw where player_id = p.id), '[]'),
    'wishlist', coalesce((select jsonb_agg(jsonb_build_object('ref', id, 'tier', tier, 'label', label, 'amount', amount,
        'position', position, 'archived_at', archived_at) order by tier, position, id)
      from wishlist_item where player_id = p.id), '[]'),
    'cagnotte_cashouts', coalesce((select jsonb_agg(jsonb_build_object('ref', id, 'description', description, 'total', total,
        'created_at', created_at) order by id)
      from cagnotte_cashout where player_id = p.id), '[]'),
    'cagnotte_entries', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'amount', amount, 'cashout_ref', cashout_id,
        'reward_draw_ref', reward_draw_id, 'created_at', created_at) order by id)
      from cagnotte_entry where player_id = p.id), '[]'),
    'weights', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'weight_kg', weight_kg, 'created_at', created_at) order by day)
      from weight_entry where player_id = p.id), '[]'),
    'legacy_log', coalesce((select jsonb_agg(jsonb_build_object('date_label', date_label, 'text', text, 'xp', xp,
        'created_at', created_at) order by created_at, id)
      from legacy_log_entry where player_id = p.id), '[]')
  );
end;
$$;

-- Import : la liste de souhaits passe avant les tirages, qui s'y rattachent. Un tirage sans « outcome »
-- (export d'avant la refonte) est tenu pour pris.
create or replace function public.import_player(p_player uuid, p_data jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r jsonb;
  new_id bigint;
  exercise_ids jsonb := '{}';
  wishlist_ids jsonb := '{}';
  draw_ids jsonb := '{}';
  cashout_ids jsonb := '{}';
  created timestamptz;
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

  for r in select * from jsonb_array_elements(coalesce(p_data -> 'wishlist', '[]')) loop
    insert into wishlist_item (player_id, tier, label, amount, position, archived_at)
    values (p_player, (r ->> 'tier')::reward_tier, r ->> 'label', (r ->> 'amount')::numeric,
            coalesce((r ->> 'position')::integer, 0), (r ->> 'archived_at')::timestamptz)
    returning id into new_id;
    if r ? 'ref' then wishlist_ids := wishlist_ids || jsonb_build_object(r ->> 'ref', new_id); end if;
  end loop;

  for r in select * from jsonb_array_elements(coalesce(p_data -> 'reward_draws', '[]')) loop
    created := coalesce((r ->> 'created_at')::timestamptz, now());
    insert into reward_draw (player_id, day, tier, name, description, wishlist_item_id, amount, outcome, decided_at,
                             is_reroll, replaces_id, created_at)
    values (p_player, (r ->> 'day')::date, (r ->> 'tier')::reward_tier, r ->> 'name', r ->> 'description',
            (wishlist_ids ->> (r ->> 'wishlist_ref'))::bigint, (r ->> 'amount')::numeric,
            case when r ? 'outcome' then (r ->> 'outcome')::reward_outcome else 'taken' end,
            case when r ? 'outcome' then (r ->> 'decided_at')::timestamptz else created end,
            coalesce((r ->> 'is_reroll')::boolean, false), (draw_ids ->> (r ->> 'replaces_ref'))::bigint, created)
    returning id into new_id;
    if r ? 'ref' then draw_ids := draw_ids || jsonb_build_object(r ->> 'ref', new_id); end if;
  end loop;

  for r in select * from jsonb_array_elements(coalesce(p_data -> 'cagnotte_cashouts', '[]')) loop
    insert into cagnotte_cashout (player_id, description, total, created_at)
    values (p_player, coalesce(r ->> 'description', ''), (r ->> 'total')::numeric, coalesce((r ->> 'created_at')::timestamptz, now()))
    returning id into new_id;
    if r ? 'ref' then cashout_ids := cashout_ids || jsonb_build_object(r ->> 'ref', new_id); end if;
  end loop;

  insert into cagnotte_entry (player_id, label, amount, cashout_id, reward_draw_id, created_at)
  select p_player, j ->> 'label', (j ->> 'amount')::numeric, (cashout_ids ->> (j ->> 'cashout_ref'))::bigint,
         (draw_ids ->> (j ->> 'reward_draw_ref'))::bigint, coalesce((j ->> 'created_at')::timestamptz, now())
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
