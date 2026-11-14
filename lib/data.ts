import type { Category, RewardTier, TabId } from "./types";

// Le carnet est dans Supabase ; le navigateur ne retient que l'onglet ouvert.
export const STORAGE_KEY = "carnet-cendres-partage-perso";

export const CATEGORY_LABELS: Record<Category, string> = {
  endurance: "Endurance",
  force: "Force",
  volonte: "Volonté",
  souplesse: "Souplesse",
  vitalite: "Vitalité",
  taichi: "Taï-chi",
};
export const CATEGORY_ORDER: Category[] = ["endurance", "force", "volonte", "souplesse", "vitalite", "taichi"];

// Règles du jeu (XP, paliers, tirages) : dans la base, voir supabase/migrations/.
export const REWARD_TIERS: RewardTier[] = [
  { tier: "commun", label: "Commun / Peu Commun", symbol: "◆", name: "Petite Trouvaille", list: "petites trouvailles", butin: "Butin commun" },
  { tier: "rare", label: "Rare", symbol: "✦", name: "Trouvaille Précieuse", list: "trouvailles précieuses", butin: "Butin rare" },
  { tier: "ultrarare", label: "Ultra-rare", symbol: "★", name: "Relique Oubliée", list: "reliques oubliées", butin: "Butin ultra-rare" },
  { tier: "legendaire", label: "Légendaire", symbol: "✵", name: "Don des Anciens", list: "dons des Anciens", butin: "Butin légendaire" },
];

export const TABS: { id: TabId; label: string }[] = [
  { id: "fiche", label: "🌾 Fiche" },
  { id: "exercices", label: "🌿 Compétences" },
  { id: "quetes", label: "🗺️ Quêtes" },
  { id: "suivi", label: "🦋 Suivi" },
  { id: "recompenses", label: "🎀 Récompenses" },
  { id: "chronique", label: "📖 Chronique" },
];
