import type { Category, RewardTier, TabId } from "./types";

// Le carnet est dans Supabase ; le navigateur ne retient que l'onglet ouvert.
export const STORAGE_KEY = "carnet-cendres-partage-perso";

export const CATEGORY_LABELS: Record<Category, string> = {
  endurance: "Endurance",
  force: "Force",
  volonte: "Volonté",
  souplesse: "Souplesse",
  vitalite: "Vitalité",
};
export const CATEGORY_ORDER: Category[] = ["endurance", "force", "volonte", "souplesse", "vitalite"];

// Règles du jeu (XP, paliers, tirages) : dans la base, voir supabase/migrations/.
export const REWARD_TIERS: RewardTier[] = [
  { tier: "commun", label: "Commun / Peu Commun", symbol: "◆" },
  { tier: "rare", label: "Rare", symbol: "✦" },
  { tier: "ultrarare", label: "Ultra-rare", symbol: "★" },
  { tier: "legendaire", label: "Légendaire", symbol: "✵" },
];

export const TABS: { id: TabId; label: string }[] = [
  { id: "fiche", label: "🌾 Fiche" },
  { id: "competences", label: "🌿 Compétences" },
  { id: "exercices", label: "🛠️ Exercices" },
  { id: "quetes", label: "🗺️ Quêtes" },
  { id: "suivi", label: "🦋 Suivi" },
  { id: "recompenses", label: "🎀 Récompenses" },
  { id: "chronique", label: "📖 Chronique" },
];
