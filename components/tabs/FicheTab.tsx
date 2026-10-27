"use client";

import { useState } from "react";
import { useCarnet, useSavedText } from "../CarnetProvider";
import { TwoStepButton } from "../TwoStepButton";
import { CATEGORY_LABELS, CATEGORY_ORDER, STORAGE_KEY } from "@/lib/data";

/** Copie complète de l'ancien carnet, laissée dans le navigateur par la version d'avant Supabase. */
function readBrowserCopy(): { text: string; savedAt: number } | null {
  try {
    const text = window.localStorage.getItem(STORAGE_KEY);
    if (!text) return null;
    return { text, savedAt: Number(window.localStorage.getItem(`${STORAGE_KEY}:savedAt`)) || 0 };
  } catch {
    return null;
  }
}

function forgetBrowserCopy() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(`${STORAGE_KEY}:savedAt`);
    window.localStorage.removeItem(`${STORAGE_KEY}:avant-fichier`);
  } catch {}
}

export function FicheTab() {
  const { carnet, act, busy, error } = useCarnet();
  const [backupText, setBackupText] = useState("");
  const [feedback, setFeedback] = useState("");
  const [browserCopy, setBrowserCopy] = useState(readBrowserCopy);
  const { progress } = carnet;

  const name = useSavedText(carnet.player.name, (v) => act("setProfile", { name: v }));
  const title = useSavedText(carnet.player.title, (v) => act("setProfile", { title: v }));

  const exportData = async () => {
    let text: string;
    try {
      const res = await fetch("/api/carnet?export", { cache: "no-store" });
      if (!res.ok) throw new Error();
      text = JSON.stringify(await res.json());
    } catch {
      setFeedback("Export impossible : le serveur ne répond pas.");
      return;
    }
    setBackupText(text);
    let copied = false;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      copied = false;
    }
    setFeedback(
      copied
        ? "Export prêt et copié. Garde-le en lieu sûr, ou colle-le dans un autre carnet puis clique sur « Importer »."
        : "Export prêt : sélectionne tout le texte et copie-le.",
    );
  };

  const importText = async (text: string): Promise<boolean> => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text.trim());
    } catch {
      setFeedback("Ce texte n'est pas un export valide.");
      return false;
    }
    try {
      const { warnings } = await act<{ warnings: string[] }>("import", { data: parsed });
      setFeedback(["Progression importée.", ...warnings].join(" "));
      return true;
    } catch (e) {
      setFeedback((e as Error).message);
      return false;
    }
  };

  const importBrowserCopy = async () => {
    if (browserCopy && (await importText(browserCopy.text))) {
      forgetBrowserCopy();
      setBrowserCopy(null);
    }
  };

  return (
    <>
      <div className="panel">
        <h2>Fiche de l&apos;Errante</h2>
        <div className="identity">
          <div className="field">
            <label htmlFor="charName">Nom</label>
            <input
              id="charName"
              type="text"
              maxLength={80}
              placeholder="Ton nom de cendrée"
              value={name.value}
              onChange={name.onChange}
              onFocus={name.onFocus}
              onBlur={name.onBlur}
            />
          </div>
          <div className="field">
            <label htmlFor="charTitle">Titre</label>
            <input
              id="charTitle"
              type="text"
              maxLength={120}
              placeholder="ex. Gardienne du Sanctuaire"
              value={title.value}
              onChange={title.onChange}
              onFocus={title.onFocus}
              onBlur={title.onBlur}
            />
          </div>
        </div>
        <div className="level-row">
          <span className="lvl">Niveau {progress.level}</span>
          <span className="xp-num">
            {progress.xp} / {progress.xpForNextLevel} XP
          </span>
        </div>
        <div className="xp-track">
          <div className="xp-fill" style={{ width: `${Math.min(100, (progress.xp / progress.xpForNextLevel) * 100)}%` }} />
        </div>
        <div className="stats-grid">
          {CATEGORY_ORDER.map((k) => (
            <div className="stat" key={k}>
              <div className="name">{CATEGORY_LABELS[k]}</div>
              <div className="val">{carnet.stats[k] ?? 0}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <h2>Comment ça marche ?</h2>
        <ul className="help-list">
          <li>
            <strong>Quêtes</strong> : chaque jour, une quête est tirée au hasard dans chaque catégorie. Fais
            l&apos;exercice, puis valide-le pour gagner de l&apos;XP.
          </li>
          <li>
            <strong>Niveaux</strong> : quand ta jauge d&apos;XP est pleine, tu montes de niveau et tu débloques un
            lancer de dé.
          </li>
          <li>
            <strong>Récompenses</strong> : remplis tes listes de souhaits (éléments séparés par « ; ») — le dé pioche
            dedans : 80 % commun, 12 % rare, 7 % ultra-rare, 1 % légendaire.
          </li>
          <li>
            <strong>Sauvegarde</strong> : chaque action est enregistrée aussitôt dans la base Supabase du carnet,
            qui garde tout l&apos;historique.
          </li>
          <li>
            <strong>Exercices</strong> : dans l&apos;onglet « Exercices », retire ce qui ne te convient pas et ajoute
            tes propres exercices pour chaque catégorie.
          </li>
        </ul>
      </div>

      <div className="panel">
        <h2>Sauvegarde</h2>
        <p className="hint">
          {error ? `⚠ ${error}` : busy ? "Enregistrement dans Supabase..." : "Carnet à jour dans Supabase."}
        </p>
        <p className="hint">
          « Exporter » donne tout le carnet (historique compris) sous forme de texte : garde-le comme copie de secours,
          ou colle-le dans un autre carnet et clique sur « Importer ». Les exports de l&apos;ancienne version sont
          acceptés aussi.
        </p>
        <div className="field">
          <textarea
            rows={5}
            aria-label="Texte de sauvegarde"
            placeholder="Le texte d'export apparaît ici — ou colle ici un export à importer"
            value={backupText}
            onChange={(e) => setBackupText(e.target.value)}
            onFocus={(e) => e.target.select()}
          />
        </div>
        <div className="btn-row">
          <button type="button" className="roll-btn inline" onClick={exportData}>
            Exporter
          </button>
          <TwoStepButton
            className="roll-btn inline alt"
            armedLabel="Confirmer le remplacement ?"
            onConfirm={() => void importText(backupText)}
          >
            Importer
          </TwoStepButton>
        </div>
        <div className="feedback">{feedback}</div>
      </div>

      {browserCopy && (
        <div className="panel">
          <h2>Ancienne copie du navigateur</h2>
          <p className="hint">
            Ce navigateur garde encore la copie de l&apos;ancienne version du carnet
            {browserCopy.savedAt ? ` (enregistrée le ${new Date(browserCopy.savedAt).toLocaleString("fr-FR")})` : ""}. Si
            tu as lancé <code>pnpm migrate:supabase</code>, elle est déjà reprise, avec tout son historique : tu peux
            l&apos;oublier. Sinon, importe-la ici (seules ses 40 dernières lignes de chronique seront datées).
          </p>
          <div className="btn-row">
            <TwoStepButton className="roll-btn inline" armedLabel="Remplacer le carnet ?" onConfirm={() => void importBrowserCopy()}>
              Importer cette copie
            </TwoStepButton>
            <TwoStepButton
              className="roll-btn inline alt"
              armedLabel="Oublier la copie ?"
              onConfirm={() => {
                forgetBrowserCopy();
                setBrowserCopy(null);
              }}
            >
              L&apos;oublier
            </TwoStepButton>
          </div>
        </div>
      )}

      <TwoStepButton
        className="reset-link"
        armedLabel="Clique encore pour tout remettre à zéro"
        onConfirm={() => void act("reset").catch(() => {})}
      >
        réinitialiser le carnet
      </TwoStepButton>
    </>
  );
}
