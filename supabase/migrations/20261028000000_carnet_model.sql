-- Modèle de données du carnet (schéma `sport`).
--
-- Principe : on enregistre les faits (quêtes validées, pas, récompenses tirées, pesées…), jamais réécrits ;
-- le niveau, l'XP, les stats, la cagnotte et la chronique sont calculés par des vues.
-- Toutes les écritures passent par les fonctions ci-dessous, qui appliquent les règles du jeu en une
-- transaction. Aujourd'hui seul le serveur (clé secrète, rôle service_role) les appelle ; les policies RLS
-- et sport.assert_player préparent la connexion de plusieurs joueurs (auth.uid()).

create schema if not exists sport;
grant usage on schema sport to service_role, authenticated;

-- Postgres donne EXECUTE à PUBLIC sur toute nouvelle fonction : on le retire, les droits sont donnés un à un.
alter default privileges in schema sport revoke execute on functions from public;

/* ---------- Référentiel ---------- */

create type sport.category as enum ('endurance', 'force', 'volonte', 'souplesse', 'vitalite');
create type sport.activity_kind as enum ('quest', 'catch_up', 'steps', 'opening_balance');
create type sport.reward_tier as enum ('commun', 'rare', 'ultrarare', 'legendaire');

create table sport.category_def (
  category sport.category primary key,
  label    text    not null,
  base_xp  integer not null check (base_xp between 1 and 50), -- XP d'un rattrapage
  position integer not null unique
);

insert into sport.category_def values
  ('endurance', 'Endurance', 15, 1),
  ('force',     'Force',     15, 2),
  ('volonte',   'Volonté',   15, 3),
  ('souplesse', 'Souplesse', 15, 4),
  ('vitalite',  'Vitalité',   5, 5);

create table sport.reward_tier_def (
  tier     sport.reward_tier primary key,
  label    text             not null,
  weight   numeric(4, 3)    not null check (weight > 0 and weight <= 1),
  flavors  text[]           not null check (cardinality(flavors) > 0),
  position integer          not null unique
);

insert into sport.reward_tier_def values
  ('commun',     'Commun / Peu Commun', 0.80, '{"Butin Commun","Offrande Ordinaire","Petite Trouvaille"}', 1),
  ('rare',       'Rare',                0.12, '{"Butin Rare","Trouvaille Précieuse"}',                     2),
  ('ultrarare',  'Ultra-rare',          0.07, '{"Trésor Ultra-rare","Relique Oubliée"}',                   3),
  ('legendaire', 'Légendaire',          0.01, '{"Artefact Légendaire","Don des Anciens"}',                 4);

-- Exercices de départ, copiés pour chaque nouveau joueur.
create table sport.default_exercise (
  id       integer generated always as identity primary key,
  category sport.category not null,
  flavor   text           not null,
  name     text           not null,
  detail   text           not null,
  xp       integer        not null check (xp between 1 and 50),
  position integer        not null,
  unique (category, position)
);

insert into sport.default_exercise (category, flavor, name, detail, xp, position) values
  ('endurance', 'La Longue Marche', 'Marche', '30 à 40 minutes, à allure confortable', 15, 1),
  ('endurance', 'Le Pas Léger', 'Marche', '15 minutes — pour les jours plus courts', 8, 2),
  ('endurance', 'La Ronde Intérieure', 'Montées de genoux sur place', '15 minutes, rythme modéré', 15, 3),
  ('endurance', 'Le Pas de Garde', 'Step touches (pas chassés latéraux)', '15 minutes, buste face à toi', 15, 4),
  ('endurance', 'La Danse des Braises', 'Danse libre', '15 minutes sur ta musique préférée', 15, 5),
  ('force', 'Le Pilier', 'Pont fessier (glute bridge)', '3 séries de 12 à 15 répétitions', 15, 1),
  ('force', 'La Garde', 'Fentes statiques (split squat)', '3 séries de 10 par jambe', 15, 2),
  ('force', 'La Sentinelle', 'Chaise invisible contre le mur', '3 tenues de 20 à 30 secondes', 15, 3),
  ('force', 'L''Ancrage du Novice', 'Pompes surélevées (mains sur un support stable)', '3 séries de 8 à 12 répétitions', 15, 4),
  ('force', 'Le Rempart', 'Squats', '3 séries de 12 à 15, dos droit, amplitude confortable', 15, 5),
  ('force', 'Le Roc', 'Élévations de mollets', '3 séries de 15 répétitions', 15, 6),
  ('volonte', 'La Position du Gardien', 'Planche sur avant-bras (genoux au sol si besoin)', '3 tenues de 15 à 30 secondes', 15, 1),
  ('volonte', 'Le Pas Assuré', 'Bird dog à quatre pattes (bras et jambe opposés)', '3 séries de 8 par côté', 15, 2),
  ('volonte', 'Rituel de Chair et d''Os', 'Dead bug (bras et jambe opposés, dos au sol)', '3 séries de 8 à 10 par côté', 15, 3),
  ('volonte', 'Le Pendule Contrôlé', 'Lever de jambe allongé(e), une jambe à la fois', '3 séries de 10 par jambe, mouvement lent', 15, 4),
  ('volonte', 'Le Serment Silencieux', 'Respiration profonde (le ventre se gonfle à l''inspiration)', '5 minutes, allongé(e) ou assis(e) confortablement', 15, 5),
  ('volonte', 'L''Équilibre des Cendres', 'Équilibre sur une jambe', '3 tenues de 20 secondes par jambe', 15, 6),
  ('souplesse', 'Le Repli du Sanctuaire', 'Posture de l''enfant', '30 à 60 secondes, respiration calme', 15, 1),
  ('souplesse', 'Le Voile Léger', 'Étirement des ischio-jambiers (jambe tendue, avec une serviette)', '2 tenues de 30 secondes par jambe', 15, 2),
  ('souplesse', 'La Porte Ouverte', 'Étirement des pectoraux dans un encadrement de porte', '2 tenues de 30 secondes par côté', 15, 3),
  ('souplesse', 'Le Mur de Pierre', 'Étirement des mollets contre un mur', '2 tenues de 30 secondes par jambe', 15, 4),
  ('souplesse', 'La Nuque du Veilleur', 'Étirement de la nuque et des trapèzes', '2 tenues de 20 secondes par côté', 15, 5),
  ('vitalite', 'Le Calice', 'Hydratation', 'Atteins ton objectif d''eau de la journée', 5, 1);

/* ---------- Données des joueurs ---------- */

create table sport.player (
  id                     uuid        primary key default gen_random_uuid(),
  auth_user_id           uuid        unique references auth.users (id) on delete set null,
  name                   text        not null default '' check (char_length(name) <= 80),
  title                  text        not null default '' check (char_length(title) <= 120),
  -- « Aujourd'hui » et « hier » sont calculés dans ce fuseau, côté base.
  time_zone              text        not null default 'Europe/Paris' check (timezone(time_zone, '2000-01-01 00:00+00'::timestamptz) is not null),
  -- Montées de niveau déjà récompensées avant l'import (sans ligne reward_draw correspondante).
  legacy_rewards_claimed integer     not null default 0 check (legacy_rewards_claimed >= 0),
  created_at             timestamptz not null default now()
);

create table sport.exercise (
  id          bigint         generated always as identity primary key,
  player_id   uuid           not null references sport.player on delete cascade,
  category    sport.category not null,
  flavor      text           not null check (char_length(flavor) between 1 and 80),
  name        text           not null check (char_length(name) between 1 and 120),
  detail      text           not null default '' check (char_length(detail) <= 300),
  xp          integer        not null check (xp between 1 and 50),
  position    integer        not null default 0,
  -- Un exercice retiré est archivé, pas effacé : l'historique continue de pointer vers lui.
  archived_at timestamptz,
  created_at  timestamptz    not null default now(),
  unique (id, player_id)
);

create index exercise_player on sport.exercise (player_id, category, position) where archived_at is null;

-- La quête tirée chaque jour dans chaque catégorie.
create table sport.daily_draw (
  player_id   uuid           not null references sport.player on delete cascade,
  day         date           not null,
  category    sport.category not null,
  exercise_id bigint         not null,
  drawn_at    timestamptz    not null default now(),
  primary key (player_id, day, category),
  foreign key (exercise_id, player_id) references sport.exercise (id, player_id)
);

create table sport.activity (
  id              bigint              generated always as identity primary key,
  player_id       uuid                not null references sport.player on delete cascade,
  kind            sport.activity_kind not null,
  day             date                not null, -- le jour où l'effort a été fait (la veille pour un rattrapage)
  category        sport.category, -- null seulement pour le solde d'ouverture global (XP)
  exercise_id     bigint,
  -- Recopiés au moment de la validation : l'exercice peut être modifié ou archivé ensuite.
  exercise_name   text,
  exercise_detail text,
  steps           integer check (steps between 0 and 200000),
  xp              integer             not null check (xp >= 0),
  stat_points     integer             not null default 0 check (stat_points >= 0),
  late            boolean             not null default false, -- saisi après coup (rattrapage de la veille)
  created_at      timestamptz         not null default now(),
  foreign key (exercise_id, player_id) references sport.exercise (id, player_id),
  check (category is not null or kind = 'opening_balance'),
  check ((kind = 'steps') = (steps is not null)),
  check (kind <> 'steps' or category = 'vitalite'),
  check (kind <> 'quest' or exercise_name is not null),
  check (kind = 'opening_balance' or stat_points <= 1),
  check (kind <> 'catch_up' or late)
);

-- Une quête (ou son rattrapage) par jour et par catégorie, une saisie de pas par jour.
create unique index activity_once_per_day on sport.activity (player_id, day, category) where kind in ('quest', 'catch_up');
create unique index activity_steps_once_per_day on sport.activity (player_id, day) where kind = 'steps';
create unique index activity_opening_once on sport.activity (player_id, category) where kind = 'opening_balance' and category is not null;
create unique index activity_opening_xp_once on sport.activity (player_id) where kind = 'opening_balance' and category is null;
create index activity_player_time on sport.activity (player_id, created_at, id);

create table sport.reward_draw (
  id          bigint            generated always as identity primary key,
  player_id   uuid              not null references sport.player on delete cascade,
  day         date              not null,
  tier        sport.reward_tier not null,
  name        text              not null, -- « Butin Rare »…
  description text, -- l'élément tiré dans la liste de souhaits ; null si la liste était vide
  is_reroll   boolean           not null default false,
  replaces_id bigint            references sport.reward_draw on delete set null,
  created_at  timestamptz       not null default now(),
  check (replaces_id is null or is_reroll)
);

-- Un seul retirage par jour.
create unique index reward_draw_one_reroll_per_day on sport.reward_draw (player_id, day) where is_reroll;
create index reward_draw_player_time on sport.reward_draw (player_id, created_at);

create table sport.wishlist_item (
  id         bigint            generated always as identity primary key,
  player_id  uuid              not null references sport.player on delete cascade,
  tier       sport.reward_tier not null,
  label      text              not null check (char_length(label) between 1 and 200),
  position   integer           not null default 0,
  created_at timestamptz       not null default now()
);

create index wishlist_item_player on sport.wishlist_item (player_id, tier, position);

create table sport.cagnotte_cashout (
  id          bigint        generated always as identity primary key,
  player_id   uuid          not null references sport.player on delete cascade,
  description text          not null default '' check (char_length(description) <= 200),
  total       numeric(10, 2) not null check (total > 0),
  created_at  timestamptz   not null default now()
);

create table sport.cagnotte_entry (
  id         bigint         generated always as identity primary key,
  player_id  uuid           not null references sport.player on delete cascade,
  label      text           not null check (char_length(label) between 1 and 200),
  amount     numeric(10, 2) not null check (amount > 0),
  cashout_id bigint         references sport.cagnotte_cashout on delete set null,
  created_at timestamptz    not null default now()
);

create index cagnotte_entry_open on sport.cagnotte_entry (player_id) where cashout_id is null;

create table sport.weight_entry (
  player_id  uuid          not null references sport.player on delete cascade,
  day        date          not null,
  weight_kg  numeric(5, 2) not null check (weight_kg between 20 and 400),
  created_at timestamptz   not null default now(),
  primary key (player_id, day)
);

-- Lignes de l'ancienne chronique qu'aucun fait importé ne reproduit (texte libre, dates sans année).
create table sport.legacy_log_entry (
  id         bigint      generated always as identity primary key,
  player_id  uuid        not null references sport.player on delete cascade,
  date_label text        not null,
  text       text        not null,
  xp         integer,
  created_at timestamptz not null
);

create index legacy_log_entry_player on sport.legacy_log_entry (player_id, created_at);

/* ---------- Règles de calcul ---------- */

-- Passer du niveau L au niveau L+1 coûte 40 × L XP.
create function sport.level_for_xp(total bigint) returns integer
language plpgsql immutable as $$
declare
  lvl integer := 1;
  rest bigint := total;
begin
  while rest >= 40 * lvl loop
    rest := rest - 40 * lvl;
    lvl := lvl + 1;
  end loop;
  return lvl;
end;
$$;

create function sport.step_xp(steps integer) returns integer
language sql immutable as $$
  select case when steps >= 9000 then 15 when steps >= 6000 then 10 when steps >= 3000 then 5 else 0 end;
$$;

/* ---------- Vues (security_invoker : la RLS de l'appelant s'applique) ---------- */

create view sport.player_progress with (security_invoker = true) as
select
  p.id as player_id,
  x.total_xp,
  l.level,
  x.total_xp - 20 * l.level * (l.level - 1) as xp_in_level,
  40 * l.level as xp_for_next_level,
  greatest(0, l.level - 1 - p.legacy_rewards_claimed - r.draws) as pending_rewards
from sport.player p
cross join lateral (select coalesce(sum(a.xp), 0)::bigint as total_xp from sport.activity a where a.player_id = p.id) x
cross join lateral (select sport.level_for_xp(x.total_xp) as level) l
cross join lateral (select count(*)::integer as draws from sport.reward_draw d where d.player_id = p.id and not d.is_reroll) r;

create view sport.player_stats with (security_invoker = true) as
select p.id as player_id, c.category, coalesce(sum(a.stat_points), 0)::integer as points
from sport.player p
cross join sport.category_def c
left join sport.activity a on a.player_id = p.id and a.category = c.category
group by p.id, c.category;

create view sport.cagnotte_balance with (security_invoker = true) as
select p.id as player_id, coalesce(sum(e.amount), 0)::numeric(10, 2) as total
from sport.player p
left join sport.cagnotte_entry e on e.player_id = p.id and e.cashout_id is null
group by p.id;

-- La chronique, reconstruite à partir des faits. Les montées de niveau sont déduites du cumul d'XP.
create view sport.chronicle with (security_invoker = true) as
with cumulated as (
  select a.*, sum(a.xp) over (partition by a.player_id order by a.created_at, a.id) as cum_xp
  from sport.activity a
)
select
  a.player_id, a.created_at as at, a.day, 'activity'::text as kind, a.kind::text as activity_kind, a.category,
  a.exercise_name as name, a.exercise_detail as detail, a.steps, a.xp, null::integer as level,
  null::sport.reward_tier as tier, null::boolean as is_reroll, null::numeric as amount,
  a.late, null::text as date_label
from cumulated a
where a.kind <> 'opening_balance'
union all
select
  a.player_id, a.created_at, a.day, 'level_up', null, null, null, null, null, null, sport.level_for_xp(a.cum_xp),
  null, null, null, null, null
from cumulated a
where a.kind <> 'opening_balance' and sport.level_for_xp(a.cum_xp) > sport.level_for_xp(a.cum_xp - a.xp)
union all
select d.player_id, d.created_at, d.day, 'reward', null, null, d.name, d.description, null, null, null,
  d.tier, d.is_reroll, null, null, null
from sport.reward_draw d
union all
select e.player_id, e.created_at, null, 'cagnotte_add', null, null, e.label, null, null, null, null,
  null, null, e.amount, null, null
from sport.cagnotte_entry e
union all
select c.player_id, c.created_at, null, 'cagnotte_cashout', null, null, null, c.description, null, null, null,
  null, null, c.total, null, null
from sport.cagnotte_cashout c
union all
select l.player_id, l.created_at, null, 'legacy', null, null, null, l.text, null, l.xp, null,
  null, null, null, null, l.date_label
from sport.legacy_log_entry l;

/* ---------- Sécurité ---------- */

alter table sport.player           enable row level security;
alter table sport.exercise         enable row level security;
alter table sport.daily_draw       enable row level security;
alter table sport.activity         enable row level security;
alter table sport.reward_draw      enable row level security;
alter table sport.wishlist_item    enable row level security;
alter table sport.cagnotte_cashout enable row level security;
alter table sport.cagnotte_entry   enable row level security;
alter table sport.weight_entry     enable row level security;
alter table sport.legacy_log_entry enable row level security;

-- Un joueur connecté lit ses propres lignes ; il n'écrit que par les fonctions (règles du jeu).
create policy player_own on sport.player for select to authenticated using (auth_user_id = (select auth.uid()));

do $$
declare
  t text;
begin
  foreach t in array array['exercise', 'daily_draw', 'activity', 'reward_draw', 'wishlist_item',
                           'cagnotte_cashout', 'cagnotte_entry', 'weight_entry', 'legacy_log_entry'] loop
    execute format(
      'create policy %I on sport.%I for select to authenticated using (player_id in (select id from sport.player where auth_user_id = (select auth.uid())))',
      t || '_own', t);
  end loop;
end;
$$;

grant select on all tables in schema sport to authenticated;
grant select, insert, update, delete on all tables in schema sport to service_role;
grant usage on all sequences in schema sport to service_role;

/* ---------- Écritures ---------- */

-- Le serveur (clé secrète, pas d'utilisateur) agit sur n'importe quel joueur ; un joueur connecté, sur le sien.
create function sport.assert_player(p_player uuid) returns sport.player
language plpgsql stable security definer set search_path = sport, pg_temp as $$
declare
  p sport.player;
begin
  select * into p from sport.player where id = p_player;
  if not found or (auth.uid() is not null and p.auth_user_id is distinct from auth.uid()) then
    raise exception 'Joueur inconnu' using errcode = 'P0002';
  end if;
  return p;
end;
$$;

create function sport.player_today(p sport.player) returns date
language sql stable as $$ select (now() at time zone p.time_zone)::date $$;

create function sport.seed_exercises(p_player uuid) returns void
language sql security definer set search_path = sport, pg_temp as $$
  insert into exercise (player_id, category, flavor, name, detail, xp, position)
  select p_player, category, flavor, name, detail, xp, position from default_exercise order by category, position;
$$;

/** Le joueur de l'appelant : le sien s'il est connecté, sinon le joueur local (sans compte). Créé au besoin. */
create function sport.current_player() returns uuid
language plpgsql security definer set search_path = sport, pg_temp as $$
declare
  pid uuid;
begin
  perform pg_advisory_xact_lock(hashtext('sport.current_player'));
  if auth.uid() is not null then
    select id into pid from player where auth_user_id = auth.uid();
  else
    select id into pid from player where auth_user_id is null order by created_at, id limit 1;
  end if;
  if pid is null then
    insert into player (auth_user_id) values (auth.uid()) returning id into pid;
    perform seed_exercises(pid);
  end if;
  return pid;
end;
$$;

/** Tire la quête du jour des catégories sans tirage, ou dont l'exercice a été archivé avant d'être fait. */
create function sport.ensure_draws(p_player uuid) returns void
language plpgsql security definer set search_path = sport, pg_temp as $$
declare
  p player := assert_player(p_player);
  today date := player_today(p);
begin
  insert into daily_draw (player_id, day, category, exercise_id)
  select p.id, today, c.category, pick.id
  from category_def c
  cross join lateral (
    select e.id from exercise e
    where e.player_id = p.id and e.category = c.category and e.archived_at is null
    order by random() limit 1
  ) pick
  where not exists (
    select 1 from activity a
    where a.player_id = p.id and a.day = today and a.category = c.category and a.kind in ('quest', 'catch_up')
  )
  on conflict (player_id, day, category) do update
    set exercise_id = excluded.exercise_id, drawn_at = now()
    where exists (select 1 from exercise e where e.id = daily_draw.exercise_id and e.archived_at is not null);
end;
$$;

-- null : champ inchangé.
create function sport.set_profile(p_player uuid, p_name text, p_title text) returns void
language plpgsql security definer set search_path = sport, pg_temp as $$
begin
  perform assert_player(p_player);
  update player set name = coalesce(trim(p_name), name), title = coalesce(trim(p_title), title) where id = p_player;
end;
$$;

create function sport.set_wishlist(p_player uuid, p_tier sport.reward_tier, p_items text[]) returns void
language plpgsql security definer set search_path = sport, pg_temp as $$
begin
  perform assert_player(p_player);
  delete from wishlist_item where player_id = p_player and tier = p_tier;
  insert into wishlist_item (player_id, tier, label, position)
  select p_player, p_tier, trim(item), ord
  from unnest(p_items) with ordinality as t (item, ord)
  where trim(item) <> '';
end;
$$;

create function sport.redraw_quest(p_player uuid, p_category sport.category) returns void
language plpgsql security definer set search_path = sport, pg_temp as $$
declare
  p player := assert_player(p_player);
  today date := player_today(p);
  current_id bigint;
  next_id bigint;
begin
  if exists (select 1 from activity where player_id = p.id and day = today and category = p_category and kind in ('quest', 'catch_up')) then
    raise exception 'Quête déjà faite aujourd''hui' using errcode = 'P0001';
  end if;
  select exercise_id into current_id from daily_draw where player_id = p.id and day = today and category = p_category;
  select id into next_id from exercise
  where player_id = p.id and category = p_category and archived_at is null and id is distinct from current_id
  order by random() limit 1;
  if next_id is null then return; end if; -- un seul exercice dans la catégorie
  insert into daily_draw (player_id, day, category, exercise_id) values (p.id, today, p_category, next_id)
  on conflict (player_id, day, category) do update set exercise_id = excluded.exercise_id, drawn_at = now();
end;
$$;

/** Valide la quête du jour ; renvoie l'XP gagnée (null si déjà faite). */
create function sport.complete_quest(p_player uuid, p_category sport.category) returns integer
language plpgsql security definer set search_path = sport, pg_temp as $$
declare
  p player := assert_player(p_player);
  today date := player_today(p);
  ex exercise;
  gained integer;
begin
  perform ensure_draws(p.id);
  select e.* into ex from daily_draw d join exercise e on e.id = d.exercise_id
  where d.player_id = p.id and d.day = today and d.category = p_category;
  if not found then
    raise exception 'Aucun exercice dans cette catégorie' using errcode = 'P0001';
  end if;
  insert into activity (player_id, kind, day, category, exercise_id, exercise_name, exercise_detail, xp, stat_points)
  values (p.id, 'quest', today, p_category, ex.id, ex.name, ex.detail, ex.xp, 1)
  on conflict (player_id, day, category) where kind in ('quest', 'catch_up') do nothing
  returning xp into gained;
  return gained;
end;
$$;

/** Rattrapage d'une catégorie pour la veille ; renvoie l'XP gagnée (null si déjà faite). */
create function sport.complete_yesterday(p_player uuid, p_category sport.category) returns integer
language plpgsql security definer set search_path = sport, pg_temp as $$
declare
  p player := assert_player(p_player);
  gained integer;
begin
  insert into activity (player_id, kind, day, category, xp, stat_points, late)
  select p.id, 'catch_up', player_today(p) - 1, p_category, base_xp, 1, true from category_def where category = p_category
  on conflict (player_id, day, category) where kind in ('quest', 'catch_up') do nothing
  returning xp into gained;
  return gained;
end;
$$;

/** Enregistre les pas du jour (ou de la veille) ; renvoie l'XP gagnée (null si déjà saisis). */
create function sport.record_steps(p_player uuid, p_steps integer, p_yesterday boolean) returns integer
language plpgsql security definer set search_path = sport, pg_temp as $$
declare
  p player := assert_player(p_player);
  xp_gained integer := step_xp(p_steps);
  gained integer;
begin
  insert into activity (player_id, kind, day, category, steps, xp, stat_points, late)
  values (p.id, 'steps', player_today(p) - case when p_yesterday then 1 else 0 end, 'vitalite', p_steps, xp_gained,
          case when xp_gained > 0 then 1 else 0 end, p_yesterday)
  on conflict (player_id, day) where kind = 'steps' do nothing
  returning xp into gained;
  return gained;
end;
$$;

create function sport.add_exercise(p_player uuid, p_category sport.category, p_flavor text, p_name text, p_detail text, p_xp integer)
returns bigint
language plpgsql security definer set search_path = sport, pg_temp as $$
declare
  new_id bigint;
begin
  perform assert_player(p_player);
  insert into exercise (player_id, category, flavor, name, detail, xp, position)
  select p_player, p_category, coalesce(nullif(trim(p_flavor), ''), 'Une nouvelle quête'), trim(p_name), trim(coalesce(p_detail, '')),
         p_xp, coalesce(max(position), 0) + 1
  from exercise where player_id = p_player and category = p_category
  returning id into new_id;
  return new_id;
end;
$$;

create function sport.archive_exercise(p_player uuid, p_exercise bigint) returns void
language plpgsql security definer set search_path = sport, pg_temp as $$
declare
  ex exercise;
begin
  perform assert_player(p_player);
  select * into ex from exercise where id = p_exercise and player_id = p_player and archived_at is null for update;
  if not found then return; end if;
  if (select count(*) from exercise where player_id = p_player and category = ex.category and archived_at is null) <= 1 then
    raise exception 'Garde au moins un exercice par catégorie' using errcode = 'P0001';
  end if;
  update exercise set archived_at = now() where id = ex.id;
  perform ensure_draws(p_player);
end;
$$;

create function sport.restore_default_exercises(p_player uuid) returns void
language plpgsql security definer set search_path = sport, pg_temp as $$
begin
  perform assert_player(p_player);
  update exercise set archived_at = now() where player_id = p_player and archived_at is null;
  perform seed_exercises(p_player);
  perform ensure_draws(p_player);
end;
$$;

create function sport.set_weight(p_player uuid, p_day date, p_weight_kg numeric) returns void
language plpgsql security definer set search_path = sport, pg_temp as $$
begin
  perform assert_player(p_player);
  insert into weight_entry (player_id, day, weight_kg) values (p_player, p_day, p_weight_kg)
  on conflict (player_id, day) do update set weight_kg = excluded.weight_kg, created_at = now();
end;
$$;

create function sport.delete_weight(p_player uuid, p_day date) returns void
language plpgsql security definer set search_path = sport, pg_temp as $$
begin
  perform assert_player(p_player);
  delete from weight_entry where player_id = p_player and day = p_day;
end;
$$;

create function sport.add_to_cagnotte(p_player uuid, p_label text, p_amount numeric) returns void
language plpgsql security definer set search_path = sport, pg_temp as $$
begin
  perform assert_player(p_player);
  insert into cagnotte_entry (player_id, label, amount)
  values (p_player, coalesce(nullif(trim(p_label), ''), 'Récompense'), p_amount);
end;
$$;

create function sport.cash_out_cagnotte(p_player uuid, p_description text) returns void
language plpgsql security definer set search_path = sport, pg_temp as $$
declare
  open_total numeric(10, 2);
  cashout bigint;
begin
  perform assert_player(p_player);
  perform 1 from cagnotte_entry where player_id = p_player and cashout_id is null for update;
  select coalesce(sum(amount), 0) into open_total from cagnotte_entry where player_id = p_player and cashout_id is null;
  if open_total <= 0 then return; end if;
  insert into cagnotte_cashout (player_id, description, total) values (p_player, trim(coalesce(p_description, '')), open_total)
  returning id into cashout;
  update cagnotte_entry set cashout_id = cashout where player_id = p_player and cashout_id is null;
end;
$$;

create function sport.reroll_available(p sport.player) returns boolean
language sql stable security definer set search_path = sport, pg_temp as $$
  select exists (select 1 from reward_draw where player_id = p.id and day = player_today(p))
     and not exists (select 1 from reward_draw where player_id = p.id and day = player_today(p) and is_reroll);
$$;

/** Lance le dé : consomme une montée de niveau, ou remplace la dernière récompense du jour (p_reroll). */
create function sport.draw_reward(p_player uuid, p_reroll boolean) returns jsonb
language plpgsql security definer set search_path = sport, pg_temp as $$
declare
  p player := assert_player(p_player);
  today date := player_today(p);
  roll numeric := random();
  t reward_tier_def;
  chosen reward_tier_def;
  item text;
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

  select label into item from wishlist_item where player_id = p.id and tier = chosen.tier order by random() limit 1;
  insert into reward_draw (player_id, day, tier, name, description, is_reroll, replaces_id)
  values (p.id, today, chosen.tier, chosen.flavors[1 + floor(random() * cardinality(chosen.flavors))::integer], item,
          p_reroll, replaced)
  returning * into drawn;
  return jsonb_build_object('tier', drawn.tier, 'name', drawn.name, 'description', drawn.description);
end;
$$;

/* ---------- Lecture ---------- */

/** Tout ce que l'interface affiche, en un appel. Tire au passage les quêtes du jour manquantes. */
create function sport.get_carnet(p_player uuid, p_chronicle_limit integer default 100) returns jsonb
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
    'catchUpXp', (select jsonb_object_agg(category, base_xp) from category_def),
    'exercises', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'category', e.category, 'flavor', e.flavor, 'name', e.name,
                                          'detail', e.detail, 'xp', e.xp) order by c.position, e.position, e.id)
      from exercise e join category_def c using (category)
      where e.player_id = p.id and e.archived_at is null), '[]'),
    'draws', (
      select jsonb_object_agg(d.category, d.exercise_id) from daily_draw d where d.player_id = p.id and d.day = today),
    -- Ce qui est déjà validé aujourd'hui et hier : catégories, et « steps » pour les pas.
    'done', jsonb_build_object(
      'today', coalesce((select jsonb_agg(case when kind = 'steps' then 'steps' else category::text end order by id) from activity
                         where player_id = p.id and day = today and kind in ('quest', 'catch_up', 'steps')), '[]'),
      'yesterday', coalesce((select jsonb_agg(case when kind = 'steps' then 'steps' else category::text end order by id) from activity
                             where player_id = p.id and day = today - 1 and kind in ('quest', 'catch_up', 'steps')), '[]')),
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

/* ---------- Export, import, remise à zéro ---------- */

create function sport.clear_player(p_player uuid) returns void
language plpgsql security definer set search_path = sport, pg_temp as $$
begin
  perform assert_player(p_player);
  delete from daily_draw where player_id = p_player;
  delete from activity where player_id = p_player;
  delete from reward_draw where player_id = p_player;
  delete from wishlist_item where player_id = p_player;
  delete from cagnotte_entry where player_id = p_player;
  delete from cagnotte_cashout where player_id = p_player;
  delete from weight_entry where player_id = p_player;
  delete from legacy_log_entry where player_id = p_player;
  delete from exercise where player_id = p_player;
  update player set name = '', title = '', legacy_rewards_claimed = 0 where id = p_player;
end;
$$;

create function sport.reset_player(p_player uuid) returns void
language plpgsql security definer set search_path = sport, pg_temp as $$
begin
  perform clear_player(p_player);
  perform seed_exercises(p_player);
end;
$$;

/** Toutes les données d'un joueur (format 2), réimportables avec sport.import_player. */
create function sport.export_player(p_player uuid) returns jsonb
language plpgsql security definer set search_path = sport, pg_temp as $$
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
        'detail', detail, 'xp', xp, 'position', position, 'archived_at', archived_at, 'created_at', created_at) order by id)
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

/** Remplace toutes les données du joueur par un export (format 2). Tout ou rien : une erreur annule l'import. */
create function sport.import_player(p_player uuid, p_data jsonb) returns void
language plpgsql security definer set search_path = sport, pg_temp as $$
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
    insert into exercise (player_id, category, flavor, name, detail, xp, position, archived_at, created_at)
    values (p_player, (r ->> 'category')::category, r ->> 'flavor', r ->> 'name', coalesce(r ->> 'detail', ''),
            (r ->> 'xp')::integer, coalesce((r ->> 'position')::integer, 0), (r ->> 'archived_at')::timestamptz,
            coalesce((r ->> 'created_at')::timestamptz, now()))
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

/* ---------- Droits sur les fonctions ---------- */

-- Seules les fonctions d'action et de lecture sont appelables ; les aides internes restent privées.
revoke execute on all functions in schema sport from public, anon, authenticated;
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
to service_role;
-- Fonctions utilisées par les vues (security_invoker) : nécessaires à tout rôle qui lit les vues.
grant execute on function sport.level_for_xp(bigint), sport.step_xp(integer) to service_role, authenticated;
