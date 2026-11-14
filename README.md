# Carnet de Cendres

Carnet de quêtes sportives façon jeu de rôle — Next.js (App Router) + TypeScript, pnpm, oxlint.

```bash
pnpm install
pnpm dev        # http://carnet.localhost:3000
pnpm lint       # oxlint
pnpm typecheck
pnpm build
pnpm db:migrate # applique les migrations SQL en attente (DATABASE_URL)
```

## Structure

- `app/` — layout (polices via `next/font`), page, `globals.css` (styles d'origine)
- `app/api/carnet/route.ts` — API (session requise) : `GET` lit le carnet (`?export` : export complet), `POST` exécute une action
- `components/CarnetProvider.tsx` — état affiché (celui du serveur), envoi des actions dans l'ordre
- `components/tabs/` — un composant par onglet
- `lib/db.ts` — accès Supabase avec la session de l'utilisateur : liste fermée d'actions, validation des arguments
- `lib/supabase.ts`, `lib/auth.ts`, `proxy.ts`, `app/login/`, `app/auth/` — connexion Supabase Auth (mot de passe, lien magique)
- `scripts/link-player.mts` — crée un compte et y rattache le carnet
- `scripts/migrate.mts` — applique les migrations SQL en attente (`pnpm db:migrate`)
- `lib/legacy.ts` — conversion des sauvegardes de l'ancien carnet (état JSON complet) vers le nouveau modèle
- `lib/carnet.ts` — lecture de la vue et textes de la chronique
- `supabase/migrations/` — schéma `public` : tables, vues, fonctions (règles du jeu)
- `scripts/migrate-to-supabase.mts` — reprise unique de l'ancienne base SQLite `data/carnet.db`

## Données

Le carnet vit dans Supabase, schéma `public`. On y enregistre des **faits**, jamais réécrits : quêtes
validées (`activity`), récompenses tirées (`reward_draw`), pesées, mises en cagnotte… Le niveau, l'XP, les
stats, la cagnotte et la chronique sont **calculés** par des vues (`player_progress`, `player_stats`,
`cagnotte_balance`, `chronicle`) : rien ne peut se désynchroniser, et la chronique n'a plus de limite.

Les règles du jeu (XP d'une compétence, +10 XP quand c'est la quête du jour, paliers de pas, une quête par
catégorie et par jour, compétences libres validables plusieurs fois — aujourd'hui ou en rattrapage de la
veille —, un retirage par jour,
tirage du dé) sont appliquées par les fonctions Postgres, en une transaction ; « aujourd'hui » est
calculé dans le fuseau du joueur.

## Connexion

Supabase Auth, par e-mail et mot de passe (`/login`). Le lien magique reste possible en secondaire
(`/login/lien`). Le serveur appelle la base avec la session de l'utilisateur (clé publishable, rôle
`authenticated`) : chaque fonction vérifie que le joueur demandé est celui du compte, et la RLS limite les
lectures à ses propres lignes. La clé secrète ne sert qu'aux scripts. Seuls les comptes existants peuvent se
connecter : on les crée avec `pnpm link-player <e-mail>`.

Un compte créé par le script n'a pas de mot de passe : « Mot de passe oublié ? » (`/login/oubli`) envoie un
lien qui ouvre la session puis mène à `/login/nouveau`, où l'on choisit le mot de passe (8 caractères au
moins). Le même chemin sert à le changer.

« Exporter » (onglet Fiche) donne tout le carnet en JSON (format 2) ; « Importer » accepte ce format et
les exports de l'ancienne version.

### Mise en place de Supabase

1. Copie `.env.example` en `.env.local` et remplis `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` et
   `SUPABASE_SECRET_KEY`.
2. Applique les migrations : renseigne `DATABASE_URL` dans `.env.local`, puis `pnpm db:migrate`
   (`--dry-run` pour voir ce qui est en attente). Le script note ce qui est appliqué dans
   `supabase_migrations.schema_migrations`. Base déjà remplie à la main (SQL Editor) : indique une fois la
   dernière migration appliquée, `pnpm db:migrate --baseline 20261028120000`.
3. Vérifie que le schéma `public` est exposé (Project Settings → Data API → « Exposed schemas », c'est le cas par défaut).
4. Reprends l'ancien carnet : `pnpm migrate:supabase`. Le script archive les sauvegardes SQLite brutes
   (`carnet_saves`), reconstruit les événements datés en comparant les sauvegardes successives, les
   importe, puis vérifie que niveau, XP, stats, récompenses en attente et cagnotte retombent sur le dernier
   état. Si le carnet Supabase contient déjà de la progression, il faut `--force` pour le remplacer.
5. Rattache le carnet à ton compte : `pnpm link-player ton@adresse` (crée le compte au besoin).
6. Authentication → URL Configuration : « Site URL » = l'adresse de production, et dans « Redirect URLs »
   `https://<ton-domaine>/auth/**` ainsi que `http://localhost:3000/auth/**` pour le dev (le lien
   « mot de passe oublié » revient sur `/auth/confirm?next=/login/nouveau`, que l'adresse exacte sans `**`
   ne couvre pas).
7. Authentication → Sign In / Providers : désactive « Allow new users to sign up » (personne d'autre ne
   peut alors créer de compte).
   Laisse le fournisseur « Email » activé : il couvre le mot de passe et le lien magique.
8. Modèle d'e-mail « Reset Password » : celui par défaut (`{{ .ConfirmationURL }}`) convient. S'il est
   personnalisé avec `token_hash`, pointe-le vers
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`.

### Vercel

Variables d'environnement : `SUPABASE_URL` et `SUPABASE_PUBLISHABLE_KEY`. Ne mets pas la clé secrète.

En dev, le serveur écoute sur le port 3000. Utilise `http://localhost:3000` (l'adresse déclarée dans les
Redirect URLs) : les liens envoyés par e-mail doivent s'ouvrir sur la même adresse que la demande.

Pour récupérer la progression de la version HTML : onglet Fiche → « Exporter » dans l'ancienne version,
puis « Importer » ici.

## Todo

- ~~Dans les chroniques ajouter le nom de la recompense~~ (fait : la chronique affiche le rang, le nom et l'élément tiré)
