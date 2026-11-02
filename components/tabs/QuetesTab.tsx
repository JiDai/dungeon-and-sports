"use client";

import { useCarnet } from "../CarnetProvider";
import { ExercisePicker } from "../ExercisePicker";
import { StepsForm } from "../StepsForm";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/data";
import { activeQuest, isDone } from "@/lib/carnet";

export function QuetesTab() {
  const { carnet, act, busy } = useCarnet();
  // Les refus et pannes s'affichent en haut du carnet (erreur du provider).
  const run = (action: string, args: Record<string, unknown>) => void act(action, args).catch(() => {});

  return (
    <>
      <div className="panel">
        <h2>Le Plateau des Quêtes</h2>
        <p className="hint">Une quête accomplie rapporte {carnet.questBonus} XP de plus que la compétence seule.</p>
        {CATEGORY_ORDER.map((cat) => {
          const quest = activeQuest(carnet, cat);
          if (!quest) return null;
          const done = isDone(carnet, "today", cat);
          return (
            <div className={`quest${done ? " done" : ""}`} key={cat}>
              <div className="flavor">{quest.flavor}</div>
              <div className="qname">{quest.name}</div>
              <div className="qdetail">{quest.detail}</div>
              <div className="row">
                <span className="xp-tag">
                  +{quest.xp} XP <span className="bonus-tag">✦ +{carnet.questBonus} XP bonus</span> ·{" "}
                  {CATEGORY_LABELS[cat]}
                </span>
                <button type="button" disabled={done || busy} onClick={() => run("completeQuest", { category: cat })}>
                  {done ? "Faite" : "Valider"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="panel">
        <h2>Entraînement Libre</h2>
        <p className="hint">N&apos;importe quelle compétence, une fois par jour chacune.</p>
        <ExercisePicker />
      </div>

      <div className="panel">
        <h2>Rattrapage de la Veille</h2>
        <p className="hint">
          Un oubli d&apos;hier ? Choisis ce que tu as réellement fait — valable uniquement pour la journée précédente.
        </p>
        <ExercisePicker yesterday />
        <StepsForm yesterday />
      </div>
    </>
  );
}
