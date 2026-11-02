// Applique les migrations de supabase/migrations/ qui ne le sont pas encore, dans l'ordre.
//
//   node --env-file=.env.local scripts/migrate.mts [--dry-run] [--baseline <version>]
//
// Chaque fichier passe dans sa propre transaction : une erreur annule ce fichier et arrête la suite.
// Les migrations appliquées sont notées dans supabase_migrations.schema_migrations (la table de la CLI
// Supabase, pour que `supabase db push` s'y retrouve aussi).
// --baseline <version> : note comme déjà appliquées, sans les exécuter, les migrations jusqu'à <version>
// incluse — pour une base remplie à la main (SQL Editor) avant ce script.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import postgres from "postgres";

const DIR = join(import.meta.dirname, "..", "supabase", "migrations");

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const baselineAt = args.indexOf("--baseline");
  const baseline = baselineAt >= 0 ? args[baselineAt + 1] : undefined;
  if (baselineAt >= 0 && !/^\d{14}$/.test(baseline ?? "")) throw new Error("Usage : --baseline <version à 14 chiffres>");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL doit être défini (voir .env.example)");

  const files = (await readdir(DIR)).filter((f) => /^\d{14}_.+\.sql$/.test(f)).sort();
  const sql = postgres(url, { onnotice: () => {}, max: 1 });
  try {
    await sql`create schema if not exists supabase_migrations`;
    await sql`create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text)`;
    const applied = new Set((await sql<{ version: string }[]>`select version from supabase_migrations.schema_migrations`).map((r) => r.version));

    if (baseline) {
      const marked = files.filter((f) => f.slice(0, 14) <= baseline && !applied.has(f.slice(0, 14)));
      for (const f of marked) {
        console.log(`${dryRun ? "[dry-run] " : ""}noté comme appliqué : ${f}`);
        if (!dryRun) await record(sql, f, null);
        applied.add(f.slice(0, 14));
      }
    } else if (applied.size === 0 && (await sql`select to_regnamespace('sport') as s`)[0].s) {
      throw new Error(
        "Le schéma sport existe mais aucune migration n'est notée : la base a été remplie à la main.\n" +
          "Indique la dernière migration déjà appliquée : pnpm db:migrate --baseline <version>",
      );
    }

    const pending = files.filter((f) => !applied.has(f.slice(0, 14)));
    if (pending.length === 0) {
      console.log("Base à jour : aucune migration en attente.");
      return;
    }
    for (const f of pending) {
      if (dryRun) {
        console.log(`[dry-run] à appliquer : ${f}`);
        continue;
      }
      const content = await readFile(join(DIR, f), "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(content);
        await record(tx, f, content);
      });
      console.log(`appliquée : ${f}`);
    }
  } finally {
    await sql.end();
  }
}

function record(sql: postgres.Sql | postgres.TransactionSql, file: string, content: string | null) {
  const name = file.slice(15, -4);
  return sql`insert into supabase_migrations.schema_migrations (version, name, statements)
             values (${file.slice(0, 14)}, ${name}, ${content === null ? null : [content]})`;
}

main().catch((e: Error) => {
  console.error(`✗ ${e.message}`);
  process.exit(1);
});
