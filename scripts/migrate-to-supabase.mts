// Reprend l'ancien carnet (base SQLite data/carnet.db) dans le modèle Supabase du schéma `sport`.
//
//   node --env-file=.env.local scripts/migrate-to-supabase.mts [--force] [export.json ...]
//
// 1. Archive les sauvegardes brutes dans sport.carnet_saves (filet de sécurité ; sans doublons).
// 2. Reconstruit les faits datés en comparant les sauvegardes successives (lib/legacy.ts) et remplace
//    le carnet du joueur local par le résultat (sport.import_player, tout ou rien).
// 3. Vérifie que niveau, XP, stats, récompenses en attente et cagnotte retombent sur le dernier état.
//
// Les fichiers JSON en argument (exports « Fiche → Exporter » de l'ancienne version) s'ajoutent à l'historique.
// Si le carnet Supabase contient déjà de la progression, il faut --force pour le remplacer.

import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createClient } from "@supabase/supabase-js";
import { convertLegacy, isLegacyState, type DefaultExercise, type LegacySnapshot } from "../lib/legacy.ts";
import type { CarnetView } from "../lib/types.ts";

const DB_FILE = path.join(process.cwd(), "data", "carnet.db");
const BATCH = 50;

function fromSqlite(): LegacySnapshot[] {
  if (!existsSync(DB_FILE)) {
    console.log(`Pas de ${DB_FILE}, rien à reprendre de SQLite.`);
    return [];
  }
  const db = new DatabaseSync(DB_FILE);
  const rows = db.prepare("SELECT saved_at, state FROM saves ORDER BY saved_at, id").all() as {
    saved_at: number;
    state: string;
  }[];
  db.close();
  return rows.map((r) => ({ savedAt: r.saved_at, state: JSON.parse(r.state) }));
}

function fromJson(file: string): LegacySnapshot {
  const saved = JSON.parse(readFileSync(file, "utf8")) as { savedAt?: unknown; state?: unknown };
  const state = saved.state ?? saved;
  if (!isLegacyState(state)) throw new Error(`${file} : ce n'est pas une sauvegarde de l'ancien carnet`);
  // Les exports n'ont pas de date : on prend celle du fichier.
  const savedAt = typeof saved.savedAt === "number" ? saved.savedAt : Math.round(statSync(file).mtimeMs);
  return { savedAt, state };
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL et SUPABASE_SECRET_KEY doivent être définis (voir .env.example)");
  const supabase = createClient(url, key, {
    db: { schema: "sport" },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const rpc = async <T,>(fn: string, args: Record<string, unknown> = {}): Promise<T> => {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) throw new Error(`Supabase (${fn}) : ${error.message} (les migrations SQL sont-elles appliquées ?)`);
    return data as T;
  };

  const argv = process.argv.slice(2);
  const force = argv.includes("--force");
  const snapshots = [...fromSqlite(), ...argv.filter((a) => a !== "--force").map(fromJson)];
  if (snapshots.length === 0) throw new Error("Aucune sauvegarde à reprendre.");

  // 1. Archive brute.
  const { data: archived, error } = await supabase.from("carnet_saves").select("saved_at");
  if (error) throw new Error(`Supabase (carnet_saves) : ${error.message}`);
  const known = new Set(archived.map((r) => Number(r.saved_at)));
  const toArchive = snapshots
    .filter((s) => !known.has(s.savedAt))
    .map((s) => ({ saved_at: s.savedAt, version: Number((s.state as { appVersion?: unknown }).appVersion) || 0, state: s.state }));
  for (let i = 0; i < toArchive.length; i += BATCH) {
    const { error: insertError } = await supabase.from("carnet_saves").insert(toArchive.slice(i, i + BATCH));
    if (insertError) throw new Error(`Supabase (carnet_saves) : ${insertError.message}`);
  }
  console.log(`Archive : ${toArchive.length} sauvegarde(s) ajoutée(s), ${snapshots.length - toArchive.length} déjà présente(s).`);

  // 2. Reconstruction et import.
  const player = await rpc<string>("current_player");
  const before = await rpc<CarnetView>("get_carnet", { p_player: player });
  if (!force && (before.progress.totalXp > 0 || before.chronicle.length > 0)) {
    throw new Error("Le carnet Supabase contient déjà de la progression. Relance avec --force pour le remplacer.");
  }
  const { data: defaults, error: defaultsError } = await supabase
    .from("default_exercise")
    .select("category, flavor, name, detail, xp")
    .order("category")
    .order("position");
  if (defaultsError) throw new Error(`Supabase (default_exercise) : ${defaultsError.message}`);

  const { data, expected, warnings } = convertLegacy(snapshots, defaults as DefaultExercise[], before.player.timeZone);
  await rpc("import_player", { p_player: player, p_data: data });
  const opening = data.activities.filter((a) => a.kind === "opening_balance");
  console.log(
    `Import : ${data.activities.length - opening.length} activité(s) datée(s), ${data.reward_draws.length} récompense(s), ` +
      `${data.exercises.length} exercice(s), ${data.weights.length} pesée(s), ${data.legacy_log.length} ligne(s) de chronique non reconnue(s).`,
  );
  if (opening.length) {
    const xp = opening.reduce((n, a) => n + a.xp, 0);
    const points = opening.reduce((n, a) => n + (a.stat_points ?? 0), 0);
    console.log(`Solde d'ouverture (avant la première sauvegarde) : ${xp} XP, ${points} point(s) de stats.`);
  }
  for (const w of warnings) console.warn(`⚠ ${w}`);

  // 3. Vérification.
  const after = await rpc<CarnetView>("get_carnet", { p_player: player });
  const checks: [string, unknown, unknown][] = [
    ["niveau", after.progress.level, expected.level],
    ["XP", after.progress.xp, expected.xp],
    ["récompenses en attente", after.progress.pendingRewards, expected.pendingRewards],
    ["cagnotte", Number(after.cagnotte.total), expected.cagnotte],
    ...Object.entries(expected.stats).map(([c, v]): [string, unknown, unknown] => [c, after.stats[c as keyof typeof after.stats], v]),
  ];
  let ok = true;
  for (const [label, got, want] of checks) {
    const same = got === want;
    ok &&= same;
    console.log(`${same ? "✓" : "✗"} ${label} : ${got}${same ? "" : ` (attendu ${want})`}`);
  }
  if (!ok) process.exitCode = 1;
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
