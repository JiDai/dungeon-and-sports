import { CATEGORY_ORDER, REWARD_TIERS } from "./data";
import { convertLegacy, isLegacyState, type DefaultExercise } from "./legacy";
import { supabaseServer } from "./supabase";
import type { CarnetExport, CarnetView, Category, RewardTierId } from "./types";

// Côté serveur uniquement : le carnet dans Supabase, schéma `sport` (voir supabase/migrations/).
// Toutes les écritures passent par les fonctions Postgres, qui appliquent les règles du jeu ; elles tournent
// avec le jeton de l'utilisateur connecté et n'agissent que sur son joueur (sport.assert_player).

type Db = Awaited<ReturnType<typeof supabaseServer>>;

/** La session d'une requête : le client Supabase de l'utilisateur et son joueur. */
export interface Session {
  db: Db;
  player: string;
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

async function rpc<T>(db: Db, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (!error) return data as T;
  // P0001 : refus d'une règle du jeu (message en français) ; 22xxx / 23xxx : valeur ou contrainte invalide.
  if (error.code === "P0001") throw new CarnetError(error.message, 409);
  if (error.code?.startsWith("22") || error.code?.startsWith("23")) throw new CarnetError("Valeur refusée par la base.", 400);
  throw new Error(`Supabase (${fn}) : ${error.message}`);
}

/** La session de l'utilisateur connecté, ou null sans connexion. Son joueur est créé au premier passage. */
export async function openSession(): Promise<Session | null> {
  const db = await supabaseServer();
  const { data } = await db.auth.getClaims();
  if (!data?.claims) return null;
  return { db, player: await rpc<string>(db, "current_player") };
}

export async function getCarnet({ db, player }: Session): Promise<CarnetView> {
  return rpc<CarnetView>(db, "get_carnet", { p_player: player });
}

export async function exportCarnet({ db, player }: Session): Promise<CarnetExport> {
  return rpc<CarnetExport>(db, "export_player", { p_player: player });
}

async function defaultExercises(db: Db): Promise<DefaultExercise[]> {
  const { data, error } = await db
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

export async function runAction(session: Session, name: string, args: Args): Promise<unknown> {
  if (name === "import") return importCarnet(session, args.data);
  const action = Object.hasOwn(ACTIONS, name) ? ACTIONS[name] : undefined;
  if (!action) throw new CarnetError(`Action inconnue : ${name}`, 400);
  const [fn, params] = action(args);
  return rpc(session.db, fn, { p_player: session.player, ...params });
}

/** Remplace le carnet par un export : format 2, ou ancien carnet (état complet ou { state }). */
async function importCarnet(session: Session, raw: unknown): Promise<{ warnings: string[] }> {
  const obj = raw as { format?: unknown; state?: unknown } | null;
  let data: CarnetExport;
  let warnings: string[] = [];
  if (obj && obj.format === 2) {
    data = obj as CarnetExport;
  } else {
    const state = obj && typeof obj === "object" && "state" in obj ? obj.state : obj;
    if (!isLegacyState(state)) throw new CarnetError("Ce texte ne ressemble pas à une sauvegarde du carnet.", 400);
    const { player } = await getCarnet(session);
    ({ data, warnings } = convertLegacy([{ savedAt: Date.now(), state }], await defaultExercises(session.db), player.timeZone));
  }
  await rpc(session.db, "import_player", { p_player: session.player, p_data: data });
  return { warnings };
}
