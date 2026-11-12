"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { emptyWishlistText, tierOf } from "@/lib/carnet";
import type { DrawnReward, RewardTierId } from "@/lib/types";
import { SYMBOL_ORDER, TierSymbol } from "./TierSymbol";

/** Temps d'affichage après l'arrêt du dé ; doit rester aligné sur `diceroll-out` dans globals.css. */
const SHOW_RESULT = 3500;

const RAYS = Array.from({ length: 12 }, (_, i) => i * 30);
const SPARKS = [
  { x: 22, y: 30, d: 0.15 },
  { x: 178, y: 42, d: 0.3 },
  { x: 36, y: 160, d: 0.45 },
  { x: 168, y: 150, d: 0.2 },
  { x: 100, y: 12, d: 0.55 },
  { x: 100, y: 190, d: 0.35 },
];

/** Feu d'artifice selon le rang : nombre de coups, et particules par coup. */
const FIREWORKS: Record<RewardTierId, { bursts: number; particles: number }> = {
  commun: { bursts: 1, particles: 8 },
  rare: { bursts: 1, particles: 18 },
  ultrarare: { bursts: 2, particles: 30 },
  legendaire: { bursts: 5, particles: 48 },
};
/** Écart entre deux coups, en secondes. */
const BURST_GAP = 0.4;

/**
 * Feu d'artifice : le premier coup part du centre du dé, les suivants d'un point voisin, un peu plus petits.
 * Positions tirées une fois, au montage.
 */
function Particles({ tier }: { tier: RewardTierId }) {
  const [particles] = useState(() => {
    const { bursts, particles: count } = FIREWORKS[tier];
    return Array.from({ length: bursts }, (_, b) => {
      const first = b === 0;
      const at = Math.random() * 2 * Math.PI;
      const ox = first ? 0 : Math.cos(at) * (50 + Math.random() * 50);
      const oy = first ? 0 : Math.sin(at) * (40 + Math.random() * 40);
      const n = first ? count : Math.round(count * 0.6);
      const reach = first ? 1 : 0.7;
      return Array.from({ length: n }, (__, i) => {
        const angle = ((i + Math.random() * 0.8) / n) * 2 * Math.PI;
        const distance = (80 + Math.random() * (tier === "legendaire" ? 120 : 80)) * reach;
        return {
          ox,
          oy,
          dx: Math.cos(angle) * distance,
          dy: Math.sin(angle) * distance,
          size: 6 + Math.random() * 6,
          delay: b * BURST_GAP + Math.random() * 0.15,
        };
      });
    }).flat();
  });
  return (
    <div className="diceroll-particles" aria-hidden="true">
      {particles.map((p, i) => (
        <span
          key={i}
          className="diceroll-particle"
          style={
            {
              left: `${p.ox.toFixed(1)}px`,
              top: `${p.oy.toFixed(1)}px`,
              "--dx": `${p.dx.toFixed(1)}px`,
              "--dy": `${p.dy.toFixed(1)}px`,
              "--size": `${p.size.toFixed(1)}px`,
              animationDelay: `${p.delay.toFixed(2)}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

/**
 * Lancer de dé centré : le dé roule tant que `reward` est null (tirage en cours côté serveur),
 * puis s'arrête sur le symbole du rang tiré et disparaît seul. Plus le rang est haut, plus l'effet est riche.
 */
export function DiceRollOverlay({ reward, onDone }: { reward: DrawnReward | null; onDone: () => void }) {
  const [face, setFace] = useState(0);

  useEffect(() => {
    if (reward) return;
    const id = window.setInterval(() => setFace((f) => (f + 1) % SYMBOL_ORDER.length), 110);
    return () => window.clearInterval(id);
  }, [reward]);

  useEffect(() => {
    if (!reward) return;
    const id = window.setTimeout(onDone, SHOW_RESULT);
    return () => window.clearTimeout(id);
  }, [reward, onDone]);

  const tier = reward ? tierOf(reward.tier) : null;
  const rays = tier && tier.tier !== "commun";
  const sparks = tier && (tier.tier === "ultrarare" || tier.tier === "legendaire");

  // Rendu dans <body> : l'onglet qui l'affiche s'anime avec un transform, qui décalerait un élément fixed.
  return createPortal(
    <output className={`diceroll${tier ? ` landed ${tier.tier}` : ""}`} aria-live="polite">
      <div className="diceroll-card">
        <div className="diceroll-stage">
          {tier && (
            <svg className="diceroll-burst" viewBox="0 0 200 200" aria-hidden="true">
              {rays && (
                <g className="levelup-rays diceroll-rays">
                  {RAYS.map((a) => (
                    <path key={a} d="M100 100 L94 8 L106 8 Z" transform={`rotate(${a} 100 100)`} />
                  ))}
                </g>
              )}
              {sparks &&
                SPARKS.map((s, i) => (
                  <path
                    key={i}
                    className="levelup-spark diceroll-spark"
                    style={{ animationDelay: `${s.d}s` }}
                    d={`M${s.x} ${s.y - 7} L${s.x + 2} ${s.y - 2} L${s.x + 7} ${s.y} L${s.x + 2} ${s.y + 2} L${s.x} ${s.y + 7} L${s.x - 2} ${s.y + 2} L${s.x - 7} ${s.y} L${s.x - 2} ${s.y - 2} Z`}
                  />
                ))}
            </svg>
          )}
          {tier && <Particles tier={tier.tier} />}
          <div className="diceroll-die" aria-hidden="true">
            <TierSymbol tier={tier ? tier.tier : SYMBOL_ORDER[face]} className="diceroll-symbol" />
          </div>
        </div>
        {reward && tier ? (
          <div className="diceroll-text">
            <span className={`tier-badge ${tier.tier}`}>{tier.label}</span>
            <span className="diceroll-name">{reward.name}</span>
            <span className="diceroll-desc">{reward.description ?? emptyWishlistText(tier)}</span>
          </div>
        ) : (
          <span className="diceroll-rolling">Le dé roule…</span>
        )}
      </div>
    </output>,
    document.body,
  );
}
