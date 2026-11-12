-- Déplace tout le schéma sport dans public, puis supprime sport.
--
-- ALTER ... SET SCHEMA garde les objets tels quels (données, droits, RLS, triggers, valeurs par défaut,
-- vues) : ces références passent par les OID et suivent le déplacement. Seuls le texte des fonctions et
-- leur search_path nomment le schéma ; ils sont corrigés après le déplacement.

do $$
declare
  r record;
begin
  -- Tables (leurs séquences « owned by » suivent).
  for r in select c.relname from pg_class c where c.relnamespace = 'sport'::regnamespace and c.relkind in ('r', 'p') loop
    execute format('alter table sport.%I set schema public', r.relname);
  end loop;
  -- Séquences restantes, non rattachées à une table.
  for r in select c.relname from pg_class c where c.relnamespace = 'sport'::regnamespace and c.relkind = 'S' loop
    execute format('alter sequence sport.%I set schema public', r.relname);
  end loop;
  for r in select c.relname from pg_class c where c.relnamespace = 'sport'::regnamespace and c.relkind = 'v' loop
    execute format('alter view sport.%I set schema public', r.relname);
  end loop;
  for r in select c.relname from pg_class c where c.relnamespace = 'sport'::regnamespace and c.relkind = 'm' loop
    execute format('alter materialized view sport.%I set schema public', r.relname);
  end loop;
  -- Types propres (enums, domaines, composites autonomes), pas les types de ligne des tables.
  for r in select t.typname from pg_type t
           where t.typnamespace = 'sport'::regnamespace and t.typtype in ('e', 'd', 'c')
             and not exists (select 1 from pg_class c where c.reltype = t.oid and c.relkind <> 'c') loop
    execute format('alter type sport.%I set schema public', r.typname);
  end loop;
  -- Fonctions : déplacées, et celles qui fixaient search_path = sport le passent à public.
  for r in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'sport'::regnamespace loop
    execute format('alter routine %s set schema public', r.sig);
  end loop;
  for r in select p.oid::regprocedure as sig from pg_proc p
           where p.pronamespace = 'public'::regnamespace and 'search_path=sport, pg_temp' = any (p.proconfig) loop
    execute format('alter routine %s set search_path = public, pg_temp', r.sig);
  end loop;
end
$$;

-- Seule fonction dont le corps nommait sport.* explicitement.
create or replace function public.assert_player(p_player uuid)
 returns public.player
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  p public.player;
begin
  select * into p from public.player where id = p_player;
  if not found or (auth.uid() is not null and p.auth_user_id is distinct from auth.uid()) then
    raise exception 'Joueur inconnu' using errcode = 'P0002';
  end if;
  return p;
end;
$function$;

-- (current_player garde sa clé de verrou 'sport.current_player' : ce n'est qu'un libellé haché.)

-- Échoue si un objet est resté dans sport : rien n'est supprimé en cascade.
drop schema sport;
