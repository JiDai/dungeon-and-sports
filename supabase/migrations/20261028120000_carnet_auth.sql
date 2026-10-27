-- Connexion Supabase Auth : le serveur appelle désormais les fonctions avec le jeton de l'utilisateur connecté
-- (rôle authenticated), plus avec la clé secrète. Chaque fonction vérifie, via sport.assert_player, que le
-- joueur demandé est bien celui de auth.uid() ; sport.current_player() trouve (ou crée) le joueur du compte.
-- Le rôle anon n'a toujours aucun droit.

grant execute on function
  sport.current_player(),
  sport.get_carnet(uuid, integer),
  sport.set_profile(uuid, text, text),
  sport.set_wishlist(uuid, sport.reward_tier, text[]),
  sport.redraw_quest(uuid, sport.category),
  sport.complete_quest(uuid, sport.category),
  sport.complete_yesterday(uuid, sport.category),
  sport.record_steps(uuid, integer, boolean),
  sport.add_exercise(uuid, sport.category, text, text, text, integer),
  sport.archive_exercise(uuid, bigint),
  sport.restore_default_exercises(uuid),
  sport.set_weight(uuid, date, numeric),
  sport.delete_weight(uuid, date),
  sport.add_to_cagnotte(uuid, text, numeric),
  sport.cash_out_cagnotte(uuid, text),
  sport.draw_reward(uuid, boolean),
  sport.reset_player(uuid),
  sport.export_player(uuid),
  sport.import_player(uuid, jsonb)
to authenticated;

-- L'archive brute de l'ancien carnet reste réservée au serveur (scripts).
revoke all on sport.carnet_saves from authenticated;
