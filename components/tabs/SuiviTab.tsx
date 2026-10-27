"use client";

import { useState } from "react";
import { useCarnet } from "../CarnetProvider";
import { StepsForm } from "../StepsForm";
import { formatDateFR } from "@/lib/carnet";
import type { CarnetView } from "@/lib/types";

type WeightEntry = CarnetView["weights"][number];

function WeightChart({ entries }: { entries: WeightEntry[] }) {
  if (entries.length < 2) {
    return <div className="empty-log">Ajoute au moins deux pesées pour voir la courbe.</div>;
  }
  const recent = entries.slice(-20);
  const weights = recent.map((e) => e.weightKg);
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const pad = (max - min) * 0.15 || 1;
  const yMin = min - pad;
  const yMax = max + pad;
  const W = 600;
  const H = 150;
  const M = 24;
  const points = recent.map((e, i) => ({
    x: M + (i / (recent.length - 1)) * (W - 2 * M),
    y: H - M - ((e.weightKg - yMin) / (yMax - yMin)) * (H - 2 * M),
  }));
  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="weight-chart">
      <title>Courbe de poids</title>
      <path d={pathD} fill="none" stroke="var(--rose)" strokeWidth={2.5} />
      {points.map((p, i) => (
        <circle key={i} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r={3.5} fill="var(--honey-dark)" />
      ))}
    </svg>
  );
}

export function SuiviTab() {
  const { carnet, act, busy } = useCarnet();
  const [date, setDate] = useState(carnet.today);
  const [weight, setWeight] = useState("");
  const [feedback, setFeedback] = useState("");

  const handleAdd = async () => {
    const w = parseFloat(weight);
    if (Number.isNaN(w) || w < 20 || w > 400) {
      setFeedback("Entre un poids entre 20 et 400 kg.");
      return;
    }
    try {
      await act("setWeight", { day: date || carnet.today, weightKg: w });
      setWeight("");
      setFeedback("");
    } catch (e) {
      setFeedback((e as Error).message);
    }
  };

  const recentEntries = [...carnet.weights].reverse().slice(0, 10);

  return (
    <>
      <div className="panel">
        <h2>Les Pas de l&apos;Errante</h2>
        <p className="hint">
          Moins de 3 000 pas : 0 XP · 3 000 à 5 999 : +5 XP · 6 000 à 8 999 : +10 XP · 9 000 et plus : +15 XP
        </p>
        <StepsForm />
      </div>

      <div className="panel">
        <h2>Les Écailles du Temps</h2>
        <div className="identity cols-3">
          <div className="field">
            <label htmlFor="weightDate">Date</label>
            <input id="weightDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="weightInput">Poids (kg)</label>
            <input
              id="weightInput"
              type="number"
              min={0}
              step={0.1}
              placeholder="ex. 62.4"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </div>
          <button type="button" className="roll-btn compact" disabled={busy} onClick={handleAdd}>
            Enregistrer
          </button>
        </div>
        <div className="feedback">{feedback}</div>
        <div className="mt-18">
          <WeightChart entries={carnet.weights} />
        </div>
        <div className="mt-14">
          {recentEntries.length === 0 ? (
            <div className="empty-log">Aucune pesée enregistrée pour l&apos;instant.</div>
          ) : (
            recentEntries.map((e) => (
              <div className="weight-entry" key={e.day}>
                <span className="wdate">{formatDateFR(e.day)}</span>
                <span className="wval">{e.weightKg} kg</span>
                <button
                  type="button"
                  className="wdel"
                  title="Supprimer"
                  disabled={busy}
                  onClick={() => void act("deleteWeight", { day: e.day }).catch(() => {})}
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
