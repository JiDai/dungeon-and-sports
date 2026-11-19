// Crée (ou recrée) un joueur de test, pour essayer l'app sans toucher à un vrai carnet.
//
//   node --env-file=.env.local scripts/create-test-player.mts [--xp <n>]
//
// - un compte Supabase Auth test@carnet.test, au mot de passe tiré au hasard ;
// - son joueur « Joueur de test », exercices de départ, et un solde d'ouverture de --xp XP (400 par défaut :
//   niveau 5, donc 4 lancers de dé en attente) ;
// - l'e-mail et le mot de passe sont écrits dans .env.local (TEST_PLAYER_EMAIL, TEST_PLAYER_PASSWORD).
// Relancer le script remet le joueur de test à zéro, avec un nouveau mot de passe.

import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

const EMAIL = "test@carnet.test";
const ENV_FILE = join(import.meta.dirname, "..", ".env.local");

async function main() {
  const xpAt = process.argv.indexOf("--xp");
  const xp = xpAt >= 0 ? Number(process.argv[xpAt + 1]) : 400;
  if (!Number.isInteger(xp) || xp < 0) throw new Error("Usage : --xp <entier positif>");
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  const dbUrl = process.env.DATABASE_URL;
  if (!url || !key || !dbUrl) throw new Error("SUPABASE_URL, SUPABASE_SECRET_KEY et DATABASE_URL doivent être définis");

  // 1. Le compte, avec un nouveau mot de passe.
  const password = randomBytes(18).toString("base64url");
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }).auth.admin;
  let userId: string | undefined;
  for (let page = 1; !userId; page++) {
    const { data, error } = await admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`Auth : ${error.message}`);
    userId = data.users.find((u) => u.email?.toLowerCase() === EMAIL)?.id;
    if (data.users.length < 200) break;
  }
  if (userId) {
    const { error } = await admin.updateUserById(userId, { password });
    if (error) throw new Error(`Mot de passe : ${error.message}`);
  } else {
    const { data, error } = await admin.createUser({ email: EMAIL, password, email_confirm: true });
    if (error) throw new Error(`Création du compte : ${error.message}`);
    userId = data.user.id;
  }

  // 2. Son joueur, remis à zéro.
  const sql = postgres(dbUrl, { max: 1, onnotice: () => {} });
  try {
    await sql.begin(async (tx) => {
      await tx`delete from player where auth_user_id = ${userId}`;
      const [{ id }] = await tx`insert into player (auth_user_id, name, title) values (${userId}, 'Joueur de test', 'Testeur')
                                returning id`;
      await tx`select seed_exercises(${id})`;
      if (xp > 0) {
        await tx`insert into activity (player_id, kind, day, xp) values (${id}, 'opening_balance', current_date, ${xp})`;
      }
    });
  } finally {
    await sql.end();
  }

  // 3. Les identifiants, dans .env.local seulement.
  let env = await readFile(ENV_FILE, "utf8").catch(() => "");
  env = env.replace(/^TEST_PLAYER_(EMAIL|PASSWORD)=.*\n?/gm, "");
  if (env && !env.endsWith("\n")) env += "\n";
  env += `TEST_PLAYER_EMAIL=${EMAIL}\nTEST_PLAYER_PASSWORD=${password}\n`;
  await writeFile(ENV_FILE, env);
  console.log(`Joueur de test prêt (${EMAIL}, ${xp} XP). Identifiants dans .env.local.`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
