-- Un seul nom de butin par rang, celui qui nomme la liste de souhaits (« Liste des petites trouvailles »…).
-- Les anciens tirages prennent aussi ce nom, pour que la Chronique colle aux listes.
create temporary table butin (tier public.reward_tier primary key, name text not null) on commit drop;
insert into butin values
  ('commun',     'Petite Trouvaille'),
  ('rare',       'Trouvaille Précieuse'),
  ('ultrarare',  'Relique Oubliée'),
  ('legendaire', 'Don des Anciens');

update public.reward_tier_def t set flavors = array[b.name] from butin b where b.tier = t.tier;
update public.reward_draw d set name = b.name from butin b where b.tier = d.tier and d.name <> b.name;
