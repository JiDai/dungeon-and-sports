"use client";

import { useCarnet } from "../CarnetProvider";
import { chronicleLine } from "@/lib/carnet";

export function ChroniqueTab() {
  const { carnet } = useCarnet();

  return (
    <div className="panel">
      <h2>Chronique des Cendres</h2>
      {carnet.chronicle.length === 0 ? (
        <div className="empty-log">Aucune quête accomplie pour l&apos;instant. Le voyage commence quand tu veux.</div>
      ) : (
        carnet.chronicle.map((entry, i) => {
          const l = chronicleLine(entry);
          return (
            <div className="log-entry" key={`${entry.at}-${entry.kind}-${i}`}>
              <span>{l.text}</span>
              <span className="ldate">
                {l.date}
                {l.xp ? ` · +${l.xp} XP` : ""}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}
