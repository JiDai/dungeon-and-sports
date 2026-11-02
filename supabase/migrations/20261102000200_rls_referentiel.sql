-- RLS sur les tables du référentiel (signalées par le Security Advisor de Supabase).
-- Ce sont des données communes, sans joueur : un utilisateur connecté les lit (la vue player_stats, en
-- security_invoker, lit category_def ; lib/db.ts lit default_exercise), personne n'y écrit hors migrations.

alter table sport.category_def     enable row level security;
alter table sport.reward_tier_def  enable row level security;
alter table sport.default_exercise enable row level security;

create policy category_def_read     on sport.category_def     for select to authenticated using (true);
create policy reward_tier_def_read  on sport.reward_tier_def  for select to authenticated using (true);
create policy default_exercise_read on sport.default_exercise for select to authenticated using (true);
