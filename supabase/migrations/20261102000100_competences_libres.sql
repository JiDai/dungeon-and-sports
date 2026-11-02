-- Compétences au choix :
--  - chaque exercice actif peut être validé une fois par jour, aujourd'hui ou en rattrapage de la veille ;
--  - valider aujourd'hui l'exercice tiré pour sa catégorie compte comme la quête du jour, avec 10 XP de bonus ;
--  - plus de nouvelle pioche de la quête, ni de rattrapage par catégorie (les anciens restent dans l'historique).

alter table sport.activity add check (kind <> 'exercise' or exercise_name is not null);

-- Un même exercice une fois par jour (quête ou choix libre).
create unique index activity_exercise_once_per_day on sport.activity (player_id, day, exercise_id)
  where kind in ('quest', 'exercise');

drop function sport.redraw_quest(uuid, sport.category);
drop function sport.complete_yesterday(uuid, sport.category);

/** Valide un exercice pour aujourd'hui ou la veille ; renvoie l'XP gagnée (null si déjà fait ce jour-là). */
create function sport.complete_exercise(p_player uuid, p_exercise bigint, p_yesterday boolean) returns integer
language plpgsql security definer set search_path = sport, pg_temp as $$
declare
  p player := assert_player(p_player);
  d date := player_today(p) - case when p_yesterday then 1 else 0 end;
  quest_bonus constant integer := 10;
  ex exercise;
  is_quest boolean;
  gained integer;
begin
  select * into ex from exercise where id = p_exercise and player_id = p.id and archived_at is null;
  if not found then
    raise exception 'Exercice inconnu' using errcode = 'P0001';
  end if;
  if not p_yesterday then perform ensure_draws(p.id); end if;
  is_quest := not p_yesterday
    and exists (select 1 from daily_draw where player_id = p.id and day = d and category = ex.category and exercise_id = ex.id)
    and not exists (select 1 from activity where player_id = p.id and day = d and category = ex.category and kind in ('quest', 'catch_up'));
  insert into activity (player_id, kind, day, category, exercise_id, exercise_name, exercise_detail, xp, stat_points, late)
  values (p.id, case when is_quest then 'quest' else 'exercise' end::activity_kind, d, ex.category, ex.id, ex.name, ex.detail,
          ex.xp + case when is_quest then quest_bonus else 0 end, 1, p_yesterday)
  on conflict do nothing
  returning xp into gained;
  return gained;
end;
$$;

/** Valide la quête du jour ; renvoie l'XP gagnée, bonus compris (null si déjà faite). */
create or replace function sport.complete_quest(p_player uuid, p_category sport.category) returns integer
language plpgsql security definer set search_path = sport, pg_temp as $$
declare
  p player := assert_player(p_player);
  drawn bigint;
begin
  perform ensure_draws(p.id);
  select exercise_id into drawn from daily_draw where player_id = p.id and day = player_today(p) and category = p_category;
  if not found then
    raise exception 'Aucun exercice dans cette catégorie' using errcode = 'P0001';
  end if;
  return complete_exercise(p.id, drawn, false);
end;
$$;

/** Tout ce que l'interface affiche, en un appel. Tire au passage les quêtes du jour manquantes. */
create or replace function sport.get_carnet(p_player uuid, p_chronicle_limit integer default 100) returns jsonb
language plpgsql security definer set search_path = sport, pg_temp as $$
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
                                          'detail', e.detail, 'xp', e.xp) order by c.position, e.position, e.id)
      from exercise e join category_def c using (category)
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

revoke execute on function sport.complete_exercise(uuid, bigint, boolean) from public, anon;
grant execute on function sport.complete_exercise(uuid, bigint, boolean) to service_role, authenticated;
