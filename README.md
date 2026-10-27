# Carnet de Cendres

Carnet de quêtes sportives façon jeu de rôle — Next.js (App Router) + TypeScript, pnpm, oxlint.

```bash
pnpm install
pnpm dev        # http://carnet.localhost:3417
pnpm lint       # oxlint
pnpm typecheck
pnpm build
```

## Structure

- `app/` — layout (polices via `next/font`), page, `globals.css` (styles d'origine)
- `app/api/carnet/route.ts` — API locale : `GET` lit le carnet (`?export` : export complet), `POST` exécute une action
- `components/CarnetProvider.tsx` — état affiché (celui du serveur), envoi des actions dans l'ordre
- `components/tabs/` — un composant par onglet
- `lib/db.ts` — accès Supabase côté serveur : liste fermée d'actions, validation des arguments
- `lib/legacy.ts` — conversion des sauvegardes de l'ancien carnet (état JSON complet) vers le nouveau modèle
- `lib/carnet.ts` — lecture de la vue et textes de la chronique
- `supabase/migrations/` — schéma `sport` : tables, vues, fonctions (règles du jeu)
- `scripts/migrate-to-supabase.mts` — reprise unique de l'ancienne base SQLite `data/carnet.db`

## Données

Le carnet vit dans Supabase, schéma `sport`. On y enregistre des **faits**, jamais réécrits : quêtes
validées (`activity`), récompenses tirées (`reward_draw`), pesées, mises en cagnotte… Le niveau, l'XP, les
stats, la cagnotte et la chronique sont **calculés** par des vues (`player_progress`, `player_stats`,
`cagnotte_balance`, `chronicle`) : rien ne peut se désynchroniser, et la chronique n'a plus de limite.

Les règles du jeu (XP d'une quête, paliers de pas, une validation par jour et par catégorie, un retirage par
jour, tirage du dé) sont appliquées par les fonctions Postgres, en une transaction ; « aujourd'hui » est
calculé dans le fuseau du joueur. Le serveur local les appelle avec la clé secrète, jamais envoyée au
navigateur. Les policies RLS et `auth_user_id` préparent plusieurs joueurs connectés.

« Exporter » (onglet Fiche) donne tout le carnet en JSON (format 2) ; « Importer » accepte ce format et
les exports de l'ancienne version.

### Mise en place de Supabase

1. Copie `.env.example` en `.env.local` et remplis `SUPABASE_URL` et `SUPABASE_SECRET_KEY`.
2. Applique, dans l'ordre, les fichiers de `supabase/migrations/` (SQL Editor du tableau de bord, ou
   `supabase db push`).
3. Expose le schéma `sport` : Project Settings → Data API → « Exposed schemas », ajoute `sport`.
4. Reprends l'ancien carnet : `pnpm migrate:supabase`. Le script archive les sauvegardes SQLite brutes
   (`sport.carnet_saves`), reconstruit les événements datés en comparant les sauvegardes successives, les
   importe, puis vérifie que niveau, XP, stats, récompenses en attente et cagnotte retombent sur le dernier
   état. Si le carnet Supabase contient déjà de la progression, il faut `--force` pour le remplacer.

Le serveur écoute sur `127.0.0.1:3417` uniquement (inaccessible depuis le réseau). L'adresse
`carnet.localhost` donne au carnet un stockage navigateur à lui, séparé des autres projets lancés sur
`localhost`. Safari ne résout pas toujours `*.localhost` : utilise alors `http://127.0.0.1:3417`.

Pour récupérer la progression de la version HTML : onglet Fiche → « Exporter » dans l'ancienne version,
puis « Importer » ici.

## Todo

- ~~Dans les chroniques ajouter le nom de la recompense~~ (fait : la chronique affiche le rang, le nom et l'élément tiré)
