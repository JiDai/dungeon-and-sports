"use client";

import { useCarnet } from "../CarnetProvider";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/data";
import { poolFor } from "@/lib/carnet";

export function CompetencesTab() {
  const { carnet } = useCarnet();
  return (
    <div className="panel">
      <h2>Compétences Maîtrisées</h2>
      {CATEGORY_ORDER.map((cat) => (
        <div className="skill-block" key={cat}>
          <h3>{CATEGORY_LABELS[cat]}</h3>
          <ul className="skill-items">
            {poolFor(carnet, cat).map((q) => (
              <li key={q.id}>
                <span>{q.name}</span>
                <span className="sxp">+{q.xp} XP</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
