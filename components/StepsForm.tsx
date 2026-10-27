"use client";

import { useState } from "react";
import { useCarnet } from "./CarnetProvider";
import { isDone } from "@/lib/carnet";

/** Saisie du nombre de pas, pour aujourd'hui ou en rattrapage de la veille. */
export function StepsForm({ yesterday = false }: { yesterday?: boolean }) {
  const { carnet, act, busy } = useCarnet();
  const [value, setValue] = useState("");
  const [feedback, setFeedback] = useState("");
  const done = isDone(carnet, yesterday ? "yesterday" : "today", "steps");
  const inputId = yesterday ? "stepsInputYesterday" : "stepsInput";

  const submit = async () => {
    if (done) return;
    const steps = Number(value);
    if (!value.trim() || !Number.isInteger(steps) || steps < 0 || steps > 200_000) {
      setFeedback("Entre un nombre de pas valide.");
      return;
    }
    let xp: number | null;
    try {
      xp = await act<number | null>("recordSteps", { steps, yesterday });
    } catch (e) {
      setFeedback((e as Error).message);
      return;
    }
    setValue("");
    if (xp === null) setFeedback(yesterday ? "Déjà validé pour hier." : "Déjà validé pour aujourd'hui.");
    else if (yesterday) {
      setFeedback(xp > 0 ? `${steps} pas enregistrés pour hier — +${xp} XP.` : `${steps} pas enregistrés pour hier — pas de palier atteint.`);
    } else {
      setFeedback(
        xp > 0
          ? `${steps} pas enregistrés — +${xp} XP.`
          : `${steps} pas enregistrés — pas de palier atteint aujourd'hui, ce sera pour la prochaine fois.`,
      );
    }
  };

  const doneMessage = yesterday ? "Déjà validé pour hier." : "Déjà validé pour aujourd'hui — reviens demain.";

  return (
    <>
      <div className={`identity cols-2-1${yesterday ? " mt" : ""}`}>
        <div className="field">
          <label htmlFor={inputId}>{yesterday ? "Pas comptés hier" : "Pas comptés aujourd'hui"}</label>
          <input
            id={inputId}
            type="number"
            min={0}
            placeholder="ex. 6500"
            value={value}
            disabled={done}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <button type="button" className="roll-btn compact" disabled={done || busy} onClick={submit}>
          {done ? "Déjà validé" : "Valider"}
        </button>
      </div>
      <div className="feedback">{feedback || (done ? doneMessage : "")}</div>
    </>
  );
}
