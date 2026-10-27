import { createClient } from "@supabase/supabase-js";
import { CATEGORY_ORDER, REWARD_TIERS } from "./data";
import { convertLegacy, isLegacyState, type DefaultExercise } from "./legacy";
import type { CarnetExport, CarnetView, Category, RewardTierId } from "./types";

// Côté serveur uniquement : le carnet dans Supabase, schéma `sport` (voir supabase/migrations/).
// Toutes les écritures passent par les fonctions Postgres, qui appliquent les règles du jeu.

function open() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL et SUPABASE_SECRET_KEY doivent être définis (voir .env.example)");
  return createClient(url, key, {
    db: { schema: "sport" },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Un seul client et un seul joueur, conservés entre les rechargements à chaud du serveur de dev.
type Db = ReturnType<typeof open>;
const globalForDb = globalThis as unknown as { carnetDb?: Db; carnetPlayer?: Promise<string> };
function getDb(): Db {
  return (globalForDb.carnetDb ??= open());
}

/** Erreur à montrer telle quelle : règle du jeu refusée ou valeur invalide. */
export class CarnetError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await getDb().rpc(fn, args);
  if (!error) return data as T;
  // P0001 : refus d'une règle du jeu (message en français) ; 22xxx / 23xxx : valeur ou contrainte invalide.
  if (error.code === "P0001") throw new CarnetError(error.message, 409);
  if (error.code?.startsWith("22") || error.code?.startsWith("23")) throw new CarnetError("Valeur refusée par la base.", 400);
  throw new Error(`Supabase (${fn}) : ${error.message}`);
}

/** Le joueur local (sans compte) ; créé au premier appel. */
function playerId(): Promise<string> {
  globalForDb.carnetPlayer ??= rpc<string>("current_player").catch((e: unknown) => {
    globalForDb.carnetPlayer = undefined;
    throw e;
  });
  return globalForDb.carnetPlayer;
}

export async function getCarnet(): Promise<CarnetView> {
  return rpc<CarnetView>("get_carnet", { p_player: await playerId() });
}

export async function exportCarnet(): Promise<CarnetExport> {
  return rpc<CarnetExport>("export_player", { p_player: await playerId() });
}

export async function defaultExercises(): Promise<DefaultExercise[]> {
  const { data, error } = await getDb()
    .from("default_exercise")
    .select("category, flavor, name, detail, xp")
    .order("category")
    .order("position");
  if (error) throw new Error(`Supabase (default_exercise) : ${error.message}`);
  return data as DefaultExercise[];
}

/* ---------- Validation des arguments venant du navigateur ---------- */

type Args = Record<string, unknown>;

const bad = (what: string) => new CarnetError(`Valeur invalide : ${what}`, 400);

function category(v: unknown): Category {
  if (!CATEGORY_ORDER.includes(v as Category)) throw bad("catégorie");
  return v as Category;
}
function tier(v: unknown): RewardTierId {
  if (!REWARD_TIERS.some((t) => t.tier === v)) throw bad("rang");
  return v as RewardTierId;
}
function text(v: unknown, max: number, what: string): string {
  if (v === undefined || v === null) return "";
  if (typeof v !== "string" || v.length > max) throw bad(what);
  return v;
}
function int(v: unknown, min: number, max: number, what: string): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) throw bad(what);
  return v;
}
function decimal(v: unknown, min: number, max: number, what: string): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) throw bad(what);
  return Math.round(v * 100) / 100;
}
function day(v: unknown): string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) throw bad("date");
  return v;
}

/** Les actions du carnet : nom côté navigateur → fonction Postgres et ses arguments. */
const ACTIONS: Record<string, (a: Args) => [fn: string, args: Args]> = {
  // Un champ absent reste inchangé.
  setProfile: (a) => [
    "set_profile",
    { p_name: a.name === undefined ? null : text(a.name, 80, "nom"), p_title: a.title === undefined ? null : text(a.title, 120, "titre") },
  ],
  setWishlist: (a) => {
    if (!Array.isArray(a.items) || a.items.length > 200) throw bad("liste");
    return ["set_wishlist", { p_tier: tier(a.tier), p_items: a.items.map((i) => text(i, 200, "souhait")) }];
  },
  redrawQuest: (a) => ["redraw_quest", { p_category: category(a.category) }],
  completeQuest: (a) => ["complete_quest", { p_category: category(a.category) }],
  completeYesterday: (a) => ["complete_yesterday", { p_category: category(a.category) }],
  recordSteps: (a) => ["record_steps", { p_steps: int(a.steps, 0, 200_000, "pas"), p_yesterday: a.yesterday === true }],
  addExercise: (a) => [
    "add_exercise",
    {
      p_category: category(a.category),
      p_flavor: text(a.flavor, 80, "nom de quête"),
      p_name: text(a.name, 120, "exercice"),
      p_detail: text(a.detail, 300, "détail"),
      p_xp: int(a.xp, 1, 50, "XP"),
    },
  ],
  archiveExercise: (a) => ["archive_exercise", { p_exercise: int(a.id, 1, Number.MAX_SAFE_INTEGER, "exercice") }],
  restoreDefaultExercises: () => ["restore_default_exercises", {}],
  setWeight: (a) => ["set_weight", { p_day: day(a.day), p_weight_kg: decimal(a.weightKg, 20, 400, "poids") }],
  deleteWeight: (a) => ["delete_weight", { p_day: day(a.day) }],
  addToCagnotte: (a) => [
    "add_to_cagnotte",
    { p_label: text(a.label, 200, "libellé"), p_amount: decimal(a.amount, 0.01, 1e7, "valeur") },
  ],
  cashOutCagnotte: (a) => ["cash_out_cagnotte", { p_description: text(a.description, 200, "description") }],
  drawReward: (a) => ["draw_reward", { p_reroll: a.reroll === true }],
  reset: () => ["reset_player", {}],
};

export async function runAction(name: string, args: Args): Promise<unknown> {
  if (name === "import") return importCarnet(args.data);
  const action = Object.hasOwn(ACTIONS, name) ? ACTIONS[name] : undefined;
  if (!action) throw new CarnetError(`Action inconnue : ${name}`, 400);
  const [fn, params] = action(args);
  return rpc(fn, { p_player: await playerId(), ...params });
}

/** Remplace le carnet par un export : format 2, ou ancien carnet (état complet ou { state }). */
async function importCarnet(raw: unknown): Promise<{ warnings: string[] }> {
  const obj = raw as { format?: unknown; state?: unknown } | null;
  let data: CarnetExport;
  let warnings: string[] = [];
  if (obj && obj.format === 2) {
    data = obj as CarnetExport;
  } else {
    const state = obj && typeof obj === "object" && "state" in obj ? obj.state : obj;
    if (!isLegacyState(state)) throw new CarnetError("Ce texte ne ressemble pas à une sauvegarde du carnet.", 400);
    const { player } = await getCarnet();
    ({ data, warnings } = convertLegacy([{ savedAt: Date.now(), state }], await defaultExercises(), player.timeZone));
  }
  await rpc("import_player", { p_player: await playerId(), p_data: data });
  return { warnings };
}
