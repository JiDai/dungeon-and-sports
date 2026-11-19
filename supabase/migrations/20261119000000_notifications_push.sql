-- Notifications (Web Push) : un abonnement par appareil où le joueur les a activées.
--
-- Le navigateur donne un endpoint (l'adresse du service de push d'Apple, Google ou Mozilla) et deux clés
-- qui chiffrent le message. L'endpoint identifie l'appareil : s'il change de compte, l'abonnement suit le
-- nouveau joueur. Le joueur lit ses abonnements ; il ne les écrit que par les fonctions ci-dessous.

create table public.push_subscription (
  id           bigint      generated always as identity primary key,
  player_id    uuid        not null references public.player on delete cascade,
  endpoint     text        not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 2048),
  p256dh       text        not null check (char_length(p256dh) between 1 and 200),
  auth         text        not null check (char_length(auth) between 1 and 100),
  user_agent   text        not null default '' check (char_length(user_agent) <= 400),
  created_at   timestamptz not null default now()
);

create index push_subscription_player on public.push_subscription (player_id);

alter table public.push_subscription enable row level security;
create policy push_subscription_own on public.push_subscription for select to authenticated
  using (player_id in (select id from public.player where auth_user_id = (select auth.uid())));

revoke all on public.push_subscription from public, anon, authenticated;
grant select on public.push_subscription to authenticated;
grant select, insert, update, delete on public.push_subscription to service_role;

/** Enregistre (ou rattache au joueur) l'abonnement push d'un appareil. */
create function public.save_push_subscription(p_player uuid, p_endpoint text, p_p256dh text, p_auth text, p_user_agent text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform assert_player(p_player);
  insert into push_subscription (player_id, endpoint, p256dh, auth, user_agent)
  values (p_player, p_endpoint, p_p256dh, p_auth, left(coalesce(p_user_agent, ''), 400))
  on conflict (endpoint) do update
    set player_id = excluded.player_id, p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent;
end;
$$;

/** Oublie un abonnement du joueur : désactivé sur l'appareil, ou refusé par le service de push (expiré). */
create function public.delete_push_subscription(p_player uuid, p_endpoint text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform assert_player(p_player);
  delete from push_subscription where player_id = p_player and endpoint = p_endpoint;
end;
$$;

revoke execute on function public.save_push_subscription(uuid, text, text, text, text) from public, anon;
revoke execute on function public.delete_push_subscription(uuid, text) from public, anon;
grant execute on function public.save_push_subscription(uuid, text, text, text, text) to service_role, authenticated;
grant execute on function public.delete_push_subscription(uuid, text) to service_role, authenticated;
