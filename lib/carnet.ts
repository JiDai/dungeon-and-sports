// Lecture de la vue renvoyée par get_carnet. Les règles du jeu vivent dans la base.
import { CATEGORY_LABELS, REWARD_TIERS } from "./data";
import type { CarnetView, Category, ChronicleEntry, Exercise, RewardTier, RewardTierId } from "./types";

export function parseList(str: string): string[] {
  return (str || "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

export const joinList = (items: string[]) => items.join(" ; ");

export function formatDateFR(isoDate: string): string {
  const [, m, d] = isoDate.split("-");
  return `${d}/${m}`;
}

export const tierOf = (tier: RewardTierId): RewardTier => REWARD_TIERS.find((t) => t.tier === tier) ?? REWARD_TIERS[0];

export function poolFor(carnet: CarnetView, cat: Category): Exercise[] {
  return carnet.exercises.filter((e) => e.category === cat);
}

export function activeQuest(carnet: CarnetView, cat: Category): Exercise | undefined {
  const id = carnet.draws[cat];
  return carnet.exercises.find((e) => e.id === id) ?? poolFor(carnet, cat)[0];
}

export function isDone(carnet: CarnetView, when: "today" | "yesterday", what: Category | "steps"): boolean {
  return carnet.done[when].includes(what);
}

/** Types de la chronique, pour le filtre. Une entrée peut en avoir plusieurs (des pas en rattrapage). */
export type ChronicleType = "steps" | "exercise" | "reward" | "level_up" | "late";

export const CHRONICLE_TYPES: { id: ChronicleType; label: string }[] = [
  { id: "steps", label: "Pas" },
  { id: "exercise", label: "Exercice" },
  { id: "reward", label: "Tirage" },
  { id: "level_up", label: "Levelup" },
  { id: "late", label: "Rattrapage" },
];

export function chronicleTypes(e: ChronicleEntry): ChronicleType[] {
  const late = e.late || e.activity_kind === "catch_up";
  if (e.kind === "activity") return [e.activity_kind === "steps" ? "steps" : "exercise", ...(late ? (["late"] as const) : [])];
  if (e.kind === "reward") return ["reward"];
  if (e.kind === "level_up") return ["level_up"];
  return [];
}

/** Étiquette affichée en tête de ligne. */
export type ChronicleTag = "Pas" | "Exercice" | "Tirage" | "Levelup" | "Rattrapage";

/** Une ligne de chronique : étiquettes, titre (en gras), précision, date et XP. */
export interface ChronicleLine {
  tags: ChronicleTag[];
  title: string;
  rest: string;
  date: string;
  xp: number | null;
  /** Bonus de quête du jour, déjà compris dans `xp`. */
  bonus: number | null;
  /** Rang d'un tirage, rappelé par son symbole. */
  tier?: RewardTierId;
}

/** Premier jour où une quête du jour rapporte un bonus (migration du 02/11, appliquée le soir même). */
const QUEST_BONUS_SINCE = "2026-11-03";

export function chronicleLine(e: ChronicleEntry, questBonus: number): ChronicleLine {
  const date = e.date_label ?? (e.day ? formatDateFR(e.day) : new Date(e.at).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }));
  const line = (title: string, rest = "", tags: ChronicleTag[] = [], xp: number | null = null): ChronicleLine => ({
    tags,
    title,
    rest,
    date,
    xp,
    bonus: null,
  });
  const late: ChronicleTag[] = e.late ? ["Rattrapage"] : [];
  switch (e.kind) {
    case "activity": {
      if (e.activity_kind === "steps") return line(`${e.steps} pas`, e.xp ? "" : "sous le premier palier", ["Pas", ...late], e.xp);
      if (e.activity_kind === "catch_up") return line(CATEGORY_LABELS[e.category!], "", ["Exercice", "Rattrapage"], e.xp);
      const l = line(e.name ?? "", e.detail ?? "", ["Exercice", ...late], e.xp);
      if (e.activity_kind === "quest" && e.day && e.day >= QUEST_BONUS_SINCE) l.bonus = questBonus;
      return l;
    }
    case "level_up":
      return line(`Niveau ${e.level}`, "", ["Levelup"]);
    case "reward": {
      const rest = [e.is_reroll ? "retirage" : "", e.detail ?? ""].filter(Boolean).join(" — ");
      return { ...line(e.name ?? "", rest, ["Tirage"]), tier: e.tier ?? undefined };
    }
    case "cagnotte_add":
      return line(`🪙 Cagnotte +${e.amount}`, e.name ?? "");
    case "cagnotte_cashout":
      return line(`🏆 Cagnotte encaissée (${e.amount})`, e.detail || "récompense libre");
    default:
      return line(e.detail ?? "", "", [], e.xp);
  }
}

export const emptyWishlistText = (tier: RewardTier) =>
  `Ta liste des ${tier.list} est encore vide — ajoutes-y quelque chose pour la prochaine fois. En attendant, offre-toi un plaisir libre.`;
