-- La catégorie Taï-chi, après les cinq d'origine. Pas d'exercice par défaut : chacun ajoute le sien
-- dans Compétences ; une catégorie vide n'a simplement pas de quête du jour.
insert into sport.category_def (category, label, base_xp, position) values ('taichi', 'Taï-chi', 20, 6)
on conflict (category) do nothing;
