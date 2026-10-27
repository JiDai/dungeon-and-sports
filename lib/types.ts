export type Category = "endurance" | "force" | "volonte" | "souplesse" | "vitalite";

export type TabId = "fiche" | "competences" | "exercices" | "quetes" | "suivi" | "recompenses" | "chronique";

export type RewardTierId = "commun" | "rare" | "ultrarare" | "legendaire";

export interface RewardTier {
  tier: RewardTierId;
  label: string;
  symbol: string;
}

/* ---------- Ce que renvoie sport.get_carnet ---------- */

export interface Exercise {
  id: number;
  category: Category;
  flavor: string;
  name: string;
  detail: string;
  xp: number;
}

/** Une ligne de la vue sport.chronicle. */
export interface ChronicleEntry {
  at: string;
  day: string | null;
  kind: "activity" | "level_up" | "reward" | "cagnotte_add" | "cagnotte_cashout" | "legacy";
  activity_kind: "quest" | "catch_up" | "steps" | null;
  category: Category | null;
  name: string | null;
  detail: string | null;
  steps: number | null;
  xp: number | null;
  level: number | null;
  tier: RewardTierId | null;
  is_reroll: boolean | null;
  amount: number | null;
  late: boolean | null;
  date_label: string | null;
}

export interface CarnetView {
  player: { id: string; name: string; title: string; timeZone: string };
  today: string;
  yesterday: string;
  progress: { totalXp: number; level: number; xp: number; xpForNextLevel: number; pendingRewards: number };
  stats: Record<Category, number>;
  catchUpXp: Record<Category, number>;
  exercises: Exercise[];
  /** Exercice tiré aujourd'hui, par catégorie. */
  draws: Partial<Record<Category, number>>;
  /** Déjà validé : catégories, et "steps" pour les pas. */
  done: { today: (Category | "steps")[]; yesterday: (Category | "steps")[] };
  rerollAvailable: boolean;
  wishlists: Record<RewardTierId, string[]>;
  cagnotte: { total: number; entries: { id: number; label: string; amount: number; at: string }[] };
  weights: { day: string; weightKg: number }[];
  chronicle: ChronicleEntry[];
}

export interface DrawnReward {
  tier: RewardTierId;
  name: string;
  /** null : la liste de souhaits de ce rang était vide. */
  description: string | null;
}

/* ---------- Export format 2 (sport.export_player / sport.import_player) ---------- */

export interface CarnetExport {
  app: "carnet-de-cendres";
  format: 2;
  exportedAt: string;
  player: { name: string; title: string; time_zone: string; legacy_rewards_claimed: number };
  exercises: {
    ref: number;
    category: Category;
    flavor: string;
    name: string;
    detail: string;
    xp: number;
    position: number;
    archived_at: string | null;
    created_at: string;
  }[];
  draws: { day: string; category: Category; exercise_ref: number; drawn_at: string }[];
  activities: {
    kind: "quest" | "catch_up" | "steps" | "opening_balance";
    day: string;
    category: Category | null;
    exercise_ref?: number | null;
    exercise_name?: string;
    exercise_detail?: string;
    steps?: number;
    xp: number;
    stat_points?: number;
    /** Saisi après coup (rattrapage). */
    late?: boolean;
    created_at: string;
  }[];
  reward_draws: {
    ref: number;
    day: string;
    tier: RewardTierId;
    name: string;
    description: string | null;
    is_reroll: boolean;
    replaces_ref: number | null;
    created_at: string;
  }[];
  wishlist: { tier: RewardTierId; label: string; position: number }[];
  cagnotte_cashouts: { ref: number; description: string; total: number; created_at: string }[];
  cagnotte_entries: { label: string; amount: number; cashout_ref: number | null; created_at: string }[];
  weights: { day: string; weight_kg: number; created_at: string }[];
  legacy_log: { date_label: string; text: string; xp: number | null; created_at: string }[];
}
