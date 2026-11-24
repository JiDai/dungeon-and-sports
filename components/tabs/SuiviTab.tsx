"use client";

import { useState } from "react";
import { useCarnet } from "../CarnetProvider";
import { StepsForm } from "../StepsForm";
import { formatDateFR } from "@/lib/carnet";
import { Button } from "../Button";

type Measure = { day: string; value: number };

/** Courbe des 20 dernières valeurs d'une mesure (poids ou tour de taille). */
function MeasureChart({ entries, title, empty }: { entries: Measure[]; title: string; empty: string }) {
  if (entries.length < 2) {
    return <div className="empty-log">{empty}</div>;
  }
  const recent = entries.slice(-20);
  const values = recent.map((e) => e.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * 0.15 || 1;
  const yMin = min - pad;
  const yMax = max + pad;
  const W = 600;
  const H = 150;
  const M = 24;
  const points = recent.map((e, i) => ({
    x: M + (i / (recent.length - 1)) * (W - 2 * M),
    y: H - M - ((e.value - yMin) / (yMax - yMin)) * (H - 2 * M),
  }));
  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="weight-chart">
      <title>{title}</title>
      <path d={pathD} fill="none" stroke="var(--rose)" strokeWidth={2.5} />
      {points.map((p, i) => (
        <circle key={i} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r={3.5} fill="var(--honey-dark)" />
      ))}
    </svg>
  );
}

/** Champ numérique : vide → null, sinon le nombre (NaN si illisible). */
function parseOptional(v: string): number | null {
  return v.trim() === "" ? null : parseFloat(v.replace(",", "."));
}

export function SuiviTab() {
  const { carnet, act, busy } = useCarnet();
  const [date, setDate] = useState(carnet.today);
  const [weight, setWeight] = useState("");
  const [waist, setWaist] = useState("");
  const [feedback, setFeedback] = useState("");

  const handleAdd = async () => {
    const w = parseOptional(weight);
    const t = parseOptional(waist);
    if (w === null && t === null) {
      setFeedback("Note un poids, un tour de taille, ou les deux.");
      return;
    }
    if (w !== null && (Number.isNaN(w) || w < 20 || w > 400)) {
      setFeedback("Entre un poids entre 20 et 400 kg.");
      return;
    }
    if (t !== null && (Number.isNaN(t) || t < 30 || t > 250)) {
      setFeedback("Entre un tour de taille entre 30 et 250 cm.");
      return;
    }
    try {
      await act("setMeasures", { day: date || carnet.today, weightKg: w, waistCm: t });
      setWeight("");
      setWaist("");
      setFeedback("");
    } catch (e) {
      setFeedback((e as Error).message);
    }
  };

  const weights = carnet.weights.flatMap((e) => (e.weightKg === null ? [] : [{ day: e.day, value: e.weightKg }]));
  const waists = carnet.weights.flatMap((e) => (e.waistCm === null ? [] : [{ day: e.day, value: e.waistCm }]));
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
        <div className="identity cols-4">
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
          <div className="field">
            <label htmlFor="waistInput">Tour de taille (cm)</label>
            <input
              id="waistInput"
              type="number"
              min={0}
              step={0.5}
              placeholder="ex. 78"
              value={waist}
              onChange={(e) => setWaist(e.target.value)}
            />
          </div>
          <Button disabled={busy} onClick={handleAdd}>
            Enregistrer
          </Button>
        </div>
        <div className="feedback">{feedback}</div>
        <div className="mt-18">
          <div className="chart-label">Poids</div>
          <MeasureChart entries={weights} title="Courbe de poids" empty="Ajoute au moins deux pesées pour voir la courbe." />
        </div>
        {waists.length > 0 && (
          <div className="mt-14">
            <div className="chart-label">Tour de taille</div>
            <MeasureChart
              entries={waists}
              title="Courbe du tour de taille"
              empty="Ajoute au moins deux tours de taille pour voir leur courbe."
            />
          </div>
        )}
        <div className="mt-14">
          {recentEntries.length === 0 ? (
            <div className="empty-log">Aucune mesure enregistrée pour l&apos;instant.</div>
          ) : (
            recentEntries.map((e) => (
              <div className="weight-entry" key={e.day}>
                <span className="wdate">{formatDateFR(e.day)}</span>
                <span className="wval">
                  {[e.weightKg !== null && `${e.weightKg} kg`, e.waistCm !== null && `${e.waistCm} cm de taille`]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
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
