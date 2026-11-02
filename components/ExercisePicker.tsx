"use client";

import { useState } from "react";
import { useCarnet } from "./CarnetProvider";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/data";
import { isDone, poolFor } from "@/lib/carnet";

/** Validation d'une compétence au choix, pour aujourd'hui ou en rattrapage de la veille. */
export function ExercisePicker({ yesterday = false }: { yesterday?: boolean }) {
  const { carnet, act, busy } = useCarnet();
  const [selected, setSelected] = useState("");
  const [feedback, setFeedback] = useState("");
  const doneIds = carnet.doneExercises[yesterday ? "yesterday" : "today"];
  const doneList = carnet.exercises.filter((e) => doneIds.includes(e.id));
  const inputId = yesterday ? "exercisePickYesterday" : "exercisePick";

  // Aujourd'hui, l'exercice tiré d'une catégorie dont la quête n'est pas faite rapporte le bonus de quête.
  const isQuest = (id: number, cat: (typeof CATEGORY_ORDER)[number]) =>
    !yesterday && carnet.draws[cat] === id && !isDone(carnet, "today", cat);

  const submit = async () => {
    const id = Number(selected);
    if (!id) {
      setFeedback("Choisis une compétence.");
      return;
    }
    let xp: number | null;
    try {
      xp = await act<number | null>("completeExercise", { id, yesterday });
    } catch (e) {
      setFeedback((e as Error).message);
      return;
    }
    setSelected("");
    if (xp === null) setFeedback(yesterday ? "Déjà validée pour hier." : "Déjà validée aujourd'hui.");
    else setFeedback(`${yesterday ? "Rattrapage enregistré" : "Compétence validée"} — +${xp} XP.`);
  };

  return (
    <>
      <div className="identity cols-2-1">
        <div className="field">
          <label htmlFor={inputId}>{yesterday ? "Compétence travaillée hier" : "Compétence travaillée aujourd'hui"}</label>
          <select id={inputId} value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">Choisis une compétence…</option>
            {CATEGORY_ORDER.map((cat) => (
              <optgroup key={cat} label={CATEGORY_LABELS[cat]}>
                {poolFor(carnet, cat).map((q) => {
                  const done = doneIds.includes(q.id);
                  const quest = isQuest(q.id, cat);
                  return (
                    <option key={q.id} value={q.id} disabled={done}>
                      {`${q.name} — +${q.xp + (quest ? carnet.questBonus : 0)} XP${quest ? " (quête du jour)" : ""}${done ? " ✓" : ""}`}
                    </option>
                  );
                })}
              </optgroup>
            ))}
          </select>
        </div>
        <button type="button" className="roll-btn compact" disabled={!selected || busy} onClick={submit}>
          {yesterday ? "J'ai fait ça hier" : "Valider"}
        </button>
      </div>
      <div className="feedback">{feedback}</div>
      {doneList.length > 0 && (
        <ul className="skill-items">
          {doneList.map((q) => (
            <li key={q.id}>
              <span>✓ {q.name}</span>
              <span className="sxp">{CATEGORY_LABELS[q.category]}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
