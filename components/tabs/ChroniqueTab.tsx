"use client";

import { useState } from "react";
import { useCarnet } from "../CarnetProvider";
import { ExercisePicker } from "../ExercisePicker";
import { StepsForm } from "../StepsForm";
import { CHRONICLE_TYPES, chronicleLine, chronicleTypes, type ChronicleType } from "@/lib/carnet";

const TAG_CLASS = { Pas: "steps", Exercice: "exercise", Tirage: "reward", Levelup: "level-up", Rattrapage: "late" } as const;

export function ChroniqueTab() {
  const { carnet } = useCarnet();
  const [filter, setFilter] = useState<ChronicleType | null>(null);

  const entries = carnet.chronicle.map((entry) => ({ entry, types: chronicleTypes(entry) }));
  const count = (type: ChronicleType) => entries.filter((e) => e.types.includes(type)).length;
  const shown = filter ? entries.filter((e) => e.types.includes(filter)) : entries;

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
        {entries.length === 0 ? (
          <div className="empty-log">Aucune quête accomplie pour l&apos;instant. Le voyage commence quand tu veux.</div>
        ) : (
          <>
            <fieldset className="chips" aria-label="Filtrer la chronique">
              <button type="button" className="chip" aria-pressed={filter === null} onClick={() => setFilter(null)}>
                Tout <span className="chip-count">{entries.length}</span>
              </button>
              {CHRONICLE_TYPES.map((t) => (
                <button
                  type="button"
                  key={t.id}
                  className="chip"
                  aria-pressed={filter === t.id}
                  onClick={() => setFilter(filter === t.id ? null : t.id)}
                >
                  {t.label} <span className="chip-count">{count(t.id)}</span>
                </button>
              ))}
            </fieldset>
            {shown.length === 0 ? (
              <div className="empty-log">Rien de ce type dans la chronique récente.</div>
            ) : (
              shown.map(({ entry }, i) => {
                const l = chronicleLine(entry, carnet.questBonus);
                return (
                  <div className="log-entry" key={`${entry.at}-${entry.kind}-${i}`}>
                    <span className="log-text">
                      {l.tags.map((tag) => (
                        <span key={tag} className={`log-tag ${TAG_CLASS[tag]}`}>
                          {tag}
                        </span>
                      ))}
                      <strong className="log-title">{l.title}</strong>
                      {l.rest && <span className="log-rest"> — {l.rest}</span>}
                    </span>
                    <span className="lxp">
                      {l.bonus ? (
                        <span className="bonus-tag">
                          ✦ <span className="bonus-words">dont </span>+{l.bonus}
                          <span className="bonus-words"> bonus</span>
                        </span>
                      ) : null}
                      {l.xp ? `+${l.xp} XP` : ""}
                    </span>
                    <span className="ldate">{l.date}</span>
                  </div>
                );
              })
            )}
          </>
        )}
      </div>
    </>
  );
}
