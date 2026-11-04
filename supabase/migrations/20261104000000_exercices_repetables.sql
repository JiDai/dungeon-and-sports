-- Entraînement libre : un même exercice peut être validé plusieurs fois dans la journée (et en rattrapage).
-- La quête du jour reste unique par catégorie (index activity_once_per_day).
drop index sport.activity_exercise_once_per_day;

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
  -- Sans ce garde-fou, complete_exercise enregistrerait un simple exercice libre.
  if exists (select 1 from activity where player_id = p.id and day = player_today(p) and category = p_category
             and kind in ('quest', 'catch_up')) then
    return null;
  end if;
  return complete_exercise(p.id, drawn, false);
end;
$$;
