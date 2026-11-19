// Branche le rappel quotidien de la base sur l'app déployée : enregistre dans Supabase Vault l'adresse de la
// route de livraison et le secret partagé (CRON_SECRET), que send_due_reminders() lit à chaque passage.
//
//   node --env-file=.env.local scripts/setup-reminders.mts <https://adresse-de-l-app>
//
// Le même CRON_SECRET doit être défini sur Vercel. Relancer le script remplace les deux valeurs.

import postgres from "postgres";

async function main() {
  const origin = process.argv[2]?.trim().replace(/\/+$/, "");
  if (!origin || !/^https:\/\/[^/]+$/.test(origin)) throw new Error("Usage : pnpm reminders:setup <https://adresse-de-l-app>");
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32) throw new Error("CRON_SECRET doit être défini dans .env.local (32 caractères ou plus)");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL doit être défini (voir .env.example)");

  const sql = postgres(url, { onnotice: () => {}, max: 1 });
  try {
    const values: Record<string, string> = { reminders_url: `${origin}/api/cron/reminders`, reminders_secret: secret };
    for (const [name, value] of Object.entries(values)) {
      const [row] = await sql<{ id: string }[]>`select id from vault.secrets where name = ${name}`;
      if (row) await sql`select vault.update_secret(${row.id}::uuid, ${value})`;
      else await sql`select vault.create_secret(${value}, ${name})`;
    }
    console.log(`Rappels branchés sur ${values.reminders_url}`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
