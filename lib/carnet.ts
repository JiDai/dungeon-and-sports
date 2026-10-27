// Lecture de la vue renvoyée par sport.get_carnet. Les règles du jeu vivent dans la base.
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

/** Texte d'une ligne de chronique, dans le style de l'ancien carnet. */
export function chronicleLine(e: ChronicleEntry): { text: string; date: string; xp: number | null } {
  const late = e.late ? "(Rattrapage) " : "";
  const date = e.date_label ?? (e.day ? formatDateFR(e.day) : new Date(e.at).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }));
  switch (e.kind) {
    case "activity": {
      const xp = e.xp;
      if (e.activity_kind === "steps") {
        return { text: `${late}${e.steps} pas${xp ? "" : " — sous le premier palier"}`, date, xp };
      }
      if (e.activity_kind === "catch_up") return { text: `(Rattrapage) ${CATEGORY_LABELS[e.category!]}`, date, xp };
      return { text: `${late}${e.name}${e.detail ? ` — ${e.detail}` : ""}`, date, xp };
    }
    case "level_up":
      return { text: `⚔ Montée de niveau — Niveau ${e.level}`, date, xp: null };
    case "reward": {
      const tier = tierOf(e.tier!);
      const star = tier.tier !== "commun" ? "★ " : "";
      const what = e.detail ? ` — ${e.detail}` : "";
      return { text: `${e.is_reroll ? "↻ Retirage — " : ""}${star}${e.name} (${tier.label})${what}`, date, xp: null };
    }
    case "cagnotte_add":
      return { text: `🪙 Cagnotte +${e.amount} — ${e.name}`, date, xp: null };
    case "cagnotte_cashout":
      return { text: `🏆 Cagnotte encaissée (${e.amount}) — ${e.detail || "récompense libre"}`, date, xp: null };
    default:
      return { text: e.detail ?? "", date, xp: e.xp };
  }
}

export const emptyWishlistText = (tier: RewardTier) =>
  `Ta liste ${tier.label} est encore vide — ajoutes-y quelque chose pour la prochaine fois. En attendant, offre-toi un plaisir libre.`;
