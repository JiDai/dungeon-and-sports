"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

/** Durée totale de l'animation ; doit rester alignée sur `levelup-out` dans globals.css. */
const DURATION = 4600;

const RAYS = Array.from({ length: 12 }, (_, i) => i * 30);
const SPARKS = [
  { x: 22, y: 30, d: 0.15 },
  { x: 178, y: 42, d: 0.3 },
  { x: 36, y: 160, d: 0.45 },
  { x: 168, y: 150, d: 0.2 },
  { x: 100, y: 12, d: 0.55 },
  { x: 100, y: 190, d: 0.35 },
];

/** Annonce centrée d'une montée de niveau, qui disparaît seule sans bloquer la page. */
export function LevelUpOverlay({ level, onDone }: { level: number; onDone: () => void }) {
  useEffect(() => {
    const id = window.setTimeout(onDone, DURATION);
    return () => window.clearTimeout(id);
  }, [onDone]);

  // Rendu dans <body>, comme le lancer de dé : aucun transform d'un parent ne peut le décaler.
  return createPortal(
    <output className="levelup" aria-live="polite">
      <div className="levelup-card">
        <svg className="levelup-burst" viewBox="0 0 200 200" aria-hidden="true">
          <g className="levelup-rays">
            {RAYS.map((a) => (
              <path key={a} d="M100 100 L94 8 L106 8 Z" transform={`rotate(${a} 100 100)`} />
            ))}
          </g>
          <circle className="levelup-ring" cx="100" cy="100" r="74" />
          {SPARKS.map((s, i) => (
            <path
              key={i}
              className="levelup-spark"
              style={{ animationDelay: `${s.d}s` }}
              d={`M${s.x} ${s.y - 7} L${s.x + 2} ${s.y - 2} L${s.x + 7} ${s.y} L${s.x + 2} ${s.y + 2} L${s.x} ${s.y + 7} L${s.x - 2} ${s.y + 2} L${s.x - 7} ${s.y} L${s.x - 2} ${s.y - 2} Z`}
            />
          ))}
        </svg>
        <div className="levelup-text">
          <span className="levelup-kicker">⚔ Montée de niveau</span>
          <span className="levelup-level">Niveau {level}</span>
          <span className="levelup-hint">Un lancer de dé t&apos;attend</span>
        </div>
      </div>
    </output>,
    document.body,
  );
}
