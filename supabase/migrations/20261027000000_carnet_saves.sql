-- Tout le carnet vit dans le schéma `sport`. Il doit être ajouté aux « Exposed schemas »
-- (Project Settings → Data API) pour être accessible depuis le serveur.
create schema if not exists sport;
grant usage on schema sport to service_role;

-- Archive des sauvegardes de l'ancien carnet (un état JSON complet par ligne), remplie une fois par
-- scripts/migrate-to-supabase.mts. Le carnet lui-même vit dans le modèle de 20261028000000_carnet_model.sql.
create table if not exists sport.carnet_saves (
  id       bigint generated always as identity primary key,
  saved_at bigint  not null, -- millisecondes depuis l'epoch (Date.now() côté navigateur)
  version  integer not null,
  state    jsonb   not null
);

create index if not exists carnet_saves_saved_at on sport.carnet_saves (saved_at desc, id desc);

-- Aucune policy : seul le serveur (clé secrète / service_role) y accède.
alter table sport.carnet_saves enable row level security;
grant select, insert, delete on sport.carnet_saves to service_role;
