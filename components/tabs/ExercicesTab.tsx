"use client";

import { useState } from "react";
import { useCarnet } from "../CarnetProvider";
import { TwoStepButton } from "../TwoStepButton";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/data";
import { poolFor } from "@/lib/carnet";
import type { Category, Exercise } from "@/lib/types";
import { Button } from "../Button";

export function ExercicesTab() {
  const { carnet, act, busy } = useCarnet();
  const [cat, setCat] = useState<Category>("endurance");
  const [name, setName] = useState("");
  const [detail, setDetail] = useState("");
  const [flavor, setFlavor] = useState("");
  const [xpInput, setXpInput] = useState("15");
  const [feedback, setFeedback] = useState("");
  const [editing, setEditing] = useState<number | null>(null);

  const handleAdd = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setFeedback("Donne au moins un nom à l'exercice.");
      return;
    }
    let xp = parseInt(xpInput, 10);
    if (Number.isNaN(xp) || xp < 1) xp = 15;
    xp = Math.min(xp, 50);
    try {
      await act("addExercise", { category: cat, flavor: flavor.trim(), name: trimmed, detail: detail.trim(), xp });
    } catch (e) {
      setFeedback((e as Error).message);
      return;
    }
    setName("");
    setFlavor("");
    setDetail("");
    setXpInput("15");
    setFeedback("Exercice ajouté.");
  };

  const handleRemove = async (c: Category, id: number) => {
    if (poolFor(carnet, c).length <= 1) {
      setFeedback("Garde au moins un exercice par catégorie.");
      return;
    }
    try {
      await act("archiveExercise", { id });
      setFeedback("Exercice retiré.");
    } catch (e) {
      setFeedback((e as Error).message);
    }
  };

  const handleReset = async (id: number) => {
    try {
      await act("resetExercise", { id });
      setFeedback("Exercice remis comme au départ.");
    } catch (e) {
      setFeedback((e as Error).message);
    }
  };

  return (
    <>
      <div className="panel">
        <h2>Mes Compétences</h2>
        <p className="hint">
          Modifie, retire ce qui ne te convient pas et ajoute tes propres exercices : ces changements ne concernent que
          ton carnet. Les quêtes du jour sont tirées au hasard dans
          ces listes, et chacun peut être validé librement depuis l&apos;onglet Quêtes. Garde au moins un exercice par
          catégorie.
        </p>
        {CATEGORY_ORDER.map((c) => (
          <div className="skill-block" key={c}>
            <h3>{CATEGORY_LABELS[c]}</h3>
            <ul className="skill-items">
              {poolFor(carnet, c).map((q) =>
                editing === q.id ? (
                  <li key={q.id} className="ex-editing">
                    <ExerciseEditor
                      exercise={q}
                      onDone={(message) => {
                        setEditing(null);
                        if (message) setFeedback(message);
                      }}
                    />
                  </li>
                ) : (
                  <li key={q.id}>
                    <span>
                      {q.name}
                      <small>{q.detail}</small>
                    </span>
                    <span className="sxp">
                      +{q.xp} XP{" "}
                      {q.modified && (
                        <button
                          type="button"
                          className="ex-del"
                          title="Revenir à l'exercice de départ"
                          disabled={busy}
                          onClick={() => handleReset(q.id)}
                        >
                          ↺
                        </button>
                      )}
                      <button type="button" className="ex-del" title="Modifier" disabled={busy} onClick={() => setEditing(q.id)}>
                        ✎
                      </button>
                      <button type="button" className="ex-del" title="Retirer" disabled={busy} onClick={() => handleRemove(c, q.id)}>
                        ✕
                      </button>
                    </span>
                  </li>
                ),
              )}
            </ul>
          </div>
        ))}
      </div>

      <div className="panel">
        <h2>Ajouter un exercice</h2>
        <div className="field mb">
          <label htmlFor="exCategory">Catégorie</label>
          <select id="exCategory" value={cat} onChange={(e) => setCat(e.target.value as Category)}>
            {CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
        <div className="field mb">
          <label htmlFor="exName">Exercice</label>
          <input id="exName" type="text" placeholder="ex. Gainage latéral" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field mb">
          <label htmlFor="exDetail">Détail (séries, durée…)</label>
          <input
            id="exDetail"
            type="text"
            placeholder="ex. 3 séries de 20 secondes par côté"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
          />
        </div>
        <div className="identity cols-2-1 flush">
          <div className="field">
            <label htmlFor="exFlavor">Nom de la quête (optionnel)</label>
            <input
              id="exFlavor"
              type="text"
              placeholder="ex. Le Sentier du Gardien"
              value={flavor}
              onChange={(e) => setFlavor(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="exXp">XP (1 à 50)</label>
            <input id="exXp" type="number" min={1} max={50} value={xpInput} onChange={(e) => setXpInput(e.target.value)} />
          </div>
        </div>
        <Button center className="mt-16" disabled={busy} onClick={handleAdd}>
          Ajouter
        </Button>
        <div className="feedback">{feedback}</div>
      </div>

      <TwoStepButton
        variant="link"
        armedLabel="Clique encore pour rétablir les exercices de départ"
        onConfirm={() => {
          act("restoreDefaultExercises").then(
            () => setFeedback("Exercices de départ rétablis."),
            (e: Error) => setFeedback(e.message),
          );
        }}
      >
        rétablir les exercices de départ
      </TwoStepButton>
    </>
  );
}

/** Formulaire de modification d'un exercice, à la place de sa ligne. */
function ExerciseEditor({ exercise, onDone }: { exercise: Exercise; onDone: (message?: string) => void }) {
  const { act, busy } = useCarnet();
  const [flavor, setFlavor] = useState(exercise.flavor);
  const [name, setName] = useState(exercise.name);
  const [detail, setDetail] = useState(exercise.detail);
  const [xpInput, setXpInput] = useState(String(exercise.xp));
  const [error, setError] = useState("");
  const id = `ex${exercise.id}`;

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Donne au moins un nom à l'exercice.");
      return;
    }
    const xp = parseInt(xpInput, 10);
    if (Number.isNaN(xp) || xp < 1 || xp > 50) {
      setError("L'XP va de 1 à 50.");
      return;
    }
    try {
      await act("updateExercise", { id: exercise.id, flavor: flavor.trim(), name: trimmed, detail: detail.trim(), xp });
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    onDone("Exercice modifié.");
  };

  return (
    <form
      className="ex-editor"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="field mb">
        <label htmlFor={`${id}Name`}>Exercice</label>
        <input id={`${id}Name`} type="text" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field mb">
        <label htmlFor={`${id}Detail`}>Détail (séries, durée…)</label>
        <input id={`${id}Detail`} type="text" maxLength={300} value={detail} onChange={(e) => setDetail(e.target.value)} />
      </div>
      <div className="identity cols-2-1 flush">
        <div className="field">
          <label htmlFor={`${id}Flavor`}>Nom de la quête</label>
          <input id={`${id}Flavor`} type="text" maxLength={80} value={flavor} onChange={(e) => setFlavor(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={`${id}Xp`}>XP (1 à 50)</label>
          <input id={`${id}Xp`} type="number" min={1} max={50} value={xpInput} onChange={(e) => setXpInput(e.target.value)} />
        </div>
      </div>
      <div className="btn-row">
        <Button type="submit" disabled={busy}>
          Enregistrer
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => onDone()}>
          Annuler
        </Button>
      </div>
      {error && <div className="feedback">{error}</div>}
    </form>
  );
}
