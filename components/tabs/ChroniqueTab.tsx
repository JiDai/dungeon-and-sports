"use client";

import { useCarnet } from "../CarnetProvider";
import { ExercisePicker } from "../ExercisePicker";
import { StepsForm } from "../StepsForm";
import { chronicleLine } from "@/lib/carnet";

export function ChroniqueTab() {
  const { carnet } = useCarnet();

  return (
    <>
      <div className="panel">
        <h2>Les Braises de la Veille</h2>
        <p className="hint">
          Un oubli d&apos;hier ? Choisis ce que tu as réellement fait — valable uniquement pour la journée précédente.
        </p>
        <ExercisePicker yesterday />
        <StepsForm yesterday />
      </div>

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
    </>
  );
}
