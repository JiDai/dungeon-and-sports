import type { RewardTierId } from "@/lib/types";

/**
 * Symboles des rangs (◆ ✦ ★ ✵) dessinés en SVG, centrés sur leur boîte : en texte, chaque glyphe a sa propre
 * ligne de base et ses marges selon la police, et ne tombe jamais au milieu.
 */
const SYMBOL_PATHS: Record<RewardTierId, string> = {
  commun: "M12 3 L21 12 L12 21 L3 12 Z",
  rare: "M12 2 L14.12 9.88 L22 12 L14.12 14.12 L12 22 L9.88 14.12 L2 12 L9.88 9.88 Z",
  ultrarare:
    "M12 2.5 L14.53 9.52 L21.99 9.76 L16.09 14.33 L18.17 21.5 L12 17.3 L5.83 21.5 L7.91 14.33 L2.01 9.76 L9.47 9.52 Z",
  legendaire:
    "M12 2 L13.76 7.75 L19.07 4.93 L16.25 10.24 L22 12 L16.25 13.76 L19.07 19.07 L13.76 16.25 L12 22 L10.24 16.25 L4.93 19.07 L7.75 13.76 L2 12 L7.75 10.24 L4.93 4.93 L10.24 7.75 Z",
};
export const SYMBOL_ORDER: RewardTierId[] = ["commun", "rare", "ultrarare", "legendaire"];

export function TierSymbol({ tier, className = "" }: { tier: RewardTierId; className?: string }) {
  return (
    <svg className={`tier-symbol ${tier} ${className}`} viewBox="0 0 24 24" aria-hidden="true">
      <path d={SYMBOL_PATHS[tier]} />
    </svg>
  );
}
