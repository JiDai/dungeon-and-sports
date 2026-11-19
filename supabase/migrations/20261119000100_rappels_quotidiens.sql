-- Rappel quotidien (JID-194) : une notification par jour, à l'heure choisie par le joueur (dans son fuseau),
-- seulement s'il n'a encore rien validé ce jour-là.
--
-- C'est la base qui décide qui reçoit un rappel : pg_cron lance send_due_reminders() toutes les 15 minutes.
-- L'envoi lui-même (signature VAPID, chiffrement) se fait sur Vercel : pg_net poste la liste des messages à
-- /api/cron/reminders, avec un secret partagé. Vercel n'a ainsi besoin d'aucune clé de la base, et la base ne
-- connaît pas la clé VAPID privée. L'adresse de la route et le secret sont dans Supabase Vault
-- (reminders_url, reminders_secret : voir scripts/setup-reminders.mts) ; sans eux, rien ne part.
-- La route répond la liste des abonnements morts, oubliés au passage suivant.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- null : pas de rappel. reminder_sent_on : le dernier jour (local) où le rappel est parti.
alter table public.player
  add column reminder_time    time,
  add column reminder_sent_on date;

/** Règle l'heure du rappel quotidien (null : le coupe). Les minutes sont arrondies au quart d'heure. */
create function public.set_reminder_time(p_player uuid, p_time time) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform assert_player(p_player);
  update player
  set reminder_time = case when p_time is null then null
                           else make_time(extract(hour from p_time)::int, (extract(minute from p_time)::int / 15) * 15, 0) end
  where id = p_player;
end;
$$;

revoke execute on function public.set_reminder_time(uuid, time) from public, anon;
grant execute on function public.set_reminder_time(uuid, time) to service_role, authenticated;

-- Les envois en cours, pour lire la réponse de Vercel au passage suivant (pg_net est asynchrone).
create table public.push_dispatch (
  request_id bigint      primary key,
  created_at timestamptz not null default now()
);
alter table public.push_dispatch enable row level security;
revoke all on public.push_dispatch from public, anon, authenticated;

/** Envoie les rappels dus. Lancée par pg_cron ; personne d'autre ne peut l'appeler. */
create function public.send_due_reminders() returns integer
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_url    text := (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_url');
  v_secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_secret');
  v_players uuid[];
  v_messages jsonb;
  v_request bigint;
  bodies text[] := array[
    'Aucune quête validée aujourd''hui. Une petite marche suffit à nourrir la flamme.',
    'Ton carnet est encore vierge aujourd''hui. Les quêtes du jour t''attendent.',
    'La braise faiblit : une quête, même petite, et elle repart.',
    'Rien d''inscrit au carnet aujourd''hui. Il est encore temps.'
  ];
begin
  -- 1. Réponses des envois précédents : oublie les abonnements morts, puis l'envoi.
  delete from push_subscription s
  using push_dispatch d, net._http_response r,
        jsonb_array_elements_text(case when r.status_code = 200 and jsonb_typeof(r.content::jsonb -> 'dead') = 'array'
                                       then r.content::jsonb -> 'dead' else '[]'::jsonb end) dead(endpoint)
  where r.id = d.request_id and s.endpoint = dead.endpoint;
  delete from push_dispatch d
  where exists (select 1 from net._http_response r where r.id = d.request_id) or d.created_at < now() - interval '1 day';

  if v_url is null or v_secret is null then
    return 0;
  end if;

  -- 2. Les joueurs dont l'heure est passée depuis moins d'une heure (pas de rappel tardif si le cron a manqué un
  --    passage, ou si l'heure vient d'être réglée plus tôt dans la journée), pas encore rappelés aujourd'hui,
  --    abonnés sur au moins un appareil, et sans aucune validation du jour.
  with due as (
    select p.id
    from player p
    where p.reminder_time is not null
      and (now() at time zone p.time_zone)::time >= p.reminder_time
      -- time - time donne un intervalle sans repasser par minuit (time + interval, lui, boucle).
      and (now() at time zone p.time_zone)::time - p.reminder_time < interval '1 hour'
      and p.reminder_sent_on is distinct from player_today(p)
      and exists (select 1 from push_subscription s where s.player_id = p.id)
      and not exists (
        select 1 from activity a
        where a.player_id = p.id and a.day = player_today(p) and a.kind <> 'opening_balance'
      )
    for update of p skip locked
  ),
  marked as (
    update player p set reminder_sent_on = player_today(p) from due where p.id = due.id returning p.id
  )
  select array_agg(id) into v_players from marked;

  if v_players is null then
    return 0;
  end if;

  select jsonb_agg(jsonb_build_object(
           'title', 'Le carnet t''attend',
           'body', bodies[1 + floor(random() * array_length(bodies, 1))::int],
           'url', '/',
           'tag', 'rappel-quotidien',
           'subscriptions', subs))
  into v_messages
  from (
    select s.player_id, jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)) subs
    from push_subscription s
    where s.player_id = any (v_players)
    group by s.player_id
  ) by_player;

  -- 3. Un seul appel pour tous les rappels de ce passage.
  select net.http_post(
    url := v_url,
    body := jsonb_build_object('messages', v_messages),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 30000
  ) into v_request;
  insert into push_dispatch (request_id) values (v_request);

  return array_length(v_players, 1);
end;
$$;

revoke execute on function public.send_due_reminders() from public, anon, authenticated;

-- Toutes les 15 minutes (les heures de rappel sont des quarts d'heure). cron.schedule remplace un job du même nom.
select cron.schedule('rappels-quotidiens', '*/15 * * * *', 'select public.send_due_reminders()');
