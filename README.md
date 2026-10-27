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
- `app/api/carnet/route.ts` — API (session requise) : `GET` lit le carnet (`?export` : export complet), `POST` exécute une action
- `components/CarnetProvider.tsx` — état affiché (celui du serveur), envoi des actions dans l'ordre
- `components/tabs/` — un composant par onglet
- `lib/db.ts` — accès Supabase avec la session de l'utilisateur : liste fermée d'actions, validation des arguments
- `lib/supabase.ts`, `proxy.ts`, `app/login/`, `app/auth/` — connexion Supabase Auth (lien magique)
- `scripts/link-player.mts` — crée un compte et y rattache le carnet
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
calculé dans le fuseau du joueur.

## Connexion

Supabase Auth, par lien magique envoyé par e-mail. Le serveur appelle la base avec la session de
l'utilisateur (clé publishable, rôle `authenticated`) : chaque fonction vérifie que le joueur demandé est
celui du compte, et la RLS limite les lectures à ses propres lignes. La clé secrète ne sert qu'aux scripts.
Seuls les comptes existants reçoivent un lien : on les crée avec `pnpm link-player <e-mail>`.

« Exporter » (onglet Fiche) donne tout le carnet en JSON (format 2) ; « Importer » accepte ce format et
les exports de l'ancienne version.

### Mise en place de Supabase

1. Copie `.env.example` en `.env.local` et remplis `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` et
   `SUPABASE_SECRET_KEY`.
2. Applique, dans l'ordre, les fichiers de `supabase/migrations/` (SQL Editor du tableau de bord, ou
   `supabase db push`).
3. Expose le schéma `sport` : Project Settings → Data API → « Exposed schemas », ajoute `sport`.
4. Reprends l'ancien carnet : `pnpm migrate:supabase`. Le script archive les sauvegardes SQLite brutes
   (`sport.carnet_saves`), reconstruit les événements datés en comparant les sauvegardes successives, les
   importe, puis vérifie que niveau, XP, stats, récompenses en attente et cagnotte retombent sur le dernier
   état. Si le carnet Supabase contient déjà de la progression, il faut `--force` pour le remplacer.
5. Rattache le carnet à ton compte : `pnpm link-player ton@adresse` (crée le compte au besoin).
6. Authentication → URL Configuration : « Site URL » = l'adresse de production, et dans « Redirect URLs »
   `https://<ton-domaine>/auth/confirm` ainsi que `http://carnet.localhost:3417/auth/confirm` pour le dev.
7. Authentication → Sign In / Providers : désactive « Allow new users to sign up » (personne d'autre ne
   peut alors créer de compte).

### Vercel

Variables d'environnement : `SUPABASE_URL` et `SUPABASE_PUBLISHABLE_KEY`. Ne mets pas la clé secrète.

En dev, le serveur écoute sur `127.0.0.1:3417` uniquement. Utilise `http://carnet.localhost:3417` (l'adresse
déclarée dans les Redirect URLs) : le lien de connexion doit s'ouvrir sur la même adresse que la demande.

Pour récupérer la progression de la version HTML : onglet Fiche → « Exporter » dans l'ancienne version,
puis « Importer » ici.

## Todo

- ~~Dans les chroniques ajouter le nom de la recompense~~ (fait : la chronique affiche le rang, le nom et l'élément tiré)
