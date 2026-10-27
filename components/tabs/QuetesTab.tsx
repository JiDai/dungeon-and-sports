"use client";

import { useCarnet } from "../CarnetProvider";
import { StepsForm } from "../StepsForm";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/data";
import { activeQuest, isDone, poolFor } from "@/lib/carnet";

export function QuetesTab() {
  const { carnet, act, busy } = useCarnet();
  // Les refus et pannes s'affichent en haut du carnet (erreur du provider).
  const run = (action: string, args: Record<string, unknown>) => void act(action, args).catch(() => {});

  return (
    <>
      <div className="panel">
        <h2>Le Plateau des Quêtes</h2>
        {CATEGORY_ORDER.map((cat) => {
          const quest = activeQuest(carnet, cat);
          if (!quest) return null;
          const done = isDone(carnet, "today", cat);
          const canRedraw = !done && poolFor(carnet, cat).length > 1;
          return (
            <div className={`quest${done ? " done" : ""}`} key={cat}>
              <div className="flavor">{quest.flavor}</div>
              <div className="qname">{quest.name}</div>
              <div className="qdetail">{quest.detail}</div>
              <div className="row">
                <span className="xp-tag">
                  +{quest.xp} XP · {CATEGORY_LABELS[cat]}
                </span>
                <div className="btns">
                  {canRedraw && (
                    <button type="button" className="redraw" disabled={busy} onClick={() => run("redrawQuest", { category: cat })}>
                      Piocher à nouveau
                    </button>
                  )}
                  <button type="button" disabled={done || busy} onClick={() => run("completeQuest", { category: cat })}>
                    {done ? "Faite" : "Valider"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="panel">
        <h2>Rattrapage de la Veille</h2>
        <p className="hint">
          Un oubli d&apos;hier ? Coche ce que tu as réellement fait — valable uniquement pour la journée précédente.
        </p>
        {CATEGORY_ORDER.map((cat) => {
          const done = isDone(carnet, "yesterday", cat);
          return (
            <div className={`quest${done ? " done" : ""}`} key={cat}>
              <div className="qname">{CATEGORY_LABELS[cat]}</div>
              <div className="row">
                <span className="xp-tag">+{carnet.catchUpXp[cat]} XP</span>
                <button type="button" disabled={done || busy} onClick={() => run("completeYesterday", { category: cat })}>
                  {done ? "Faite" : "J'ai fait ça hier"}
                </button>
              </div>
            </div>
          );
        })}
        <StepsForm yesterday />
      </div>
    </>
  );
}
