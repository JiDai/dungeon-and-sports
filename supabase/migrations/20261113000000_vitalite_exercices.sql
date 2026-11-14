-- Quatre exercices de Vitalité en plus du Calice. La Veillée Sans Écran et Le Couvre-Feu parlent de la
-- veille au soir : on les valide le matin, comme un exercice du jour (pas un rattrapage).
create temporary table new_vitalite (flavor text, name text, detail text, xp integer, position integer) on commit drop;
insert into new_vitalite values
  ('Le Réveil des Articulations', 'Mobilité articulaire au lever', '5 minutes de rotations douces : chevilles, hanches, épaules, poignets', 5, 2),
  ('La Veillée Sans Écran', 'Nuit sans écran (hier soir)', 'Hier soir, tu as posé les écrans 30 minutes avant de dormir', 5, 3),
  ('L''Onde Froide', 'Douche fraîche', 'Termine ta douche par 30 secondes d''eau fraîche', 5, 4),
  ('Le Couvre-Feu', 'Coucher à l''heure (hier soir)', 'Hier soir, tu t''es couché(e) avant ton heure cible', 5, 5);

-- Pour les nouveaux joueurs.
insert into public.default_exercise (category, flavor, name, detail, xp, position)
select 'vitalite', flavor, name, detail, xp, position from new_vitalite
on conflict (category, position) do nothing;

-- Pour les joueurs existants, à la suite de leurs exercices de Vitalité (sauf s'ils l'ont déjà).
insert into public.exercise (player_id, category, flavor, name, detail, xp, position)
select p.id, 'vitalite', n.flavor, n.name, n.detail, n.xp,
       coalesce((select max(e.position) from public.exercise e where e.player_id = p.id and e.category = 'vitalite'), 0)
         + row_number() over (partition by p.id order by n.position)
from public.player p
cross join new_vitalite n
where not exists (
  select 1 from public.exercise e
  where e.player_id = p.id and e.category = 'vitalite' and e.flavor = n.flavor and e.archived_at is null
);
