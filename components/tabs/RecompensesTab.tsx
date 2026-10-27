"use client";

import { useEffect, useRef, useState } from "react";
import { useCarnet, useSavedText } from "../CarnetProvider";
import { emptyWishlistText, joinList, parseList, tierOf } from "@/lib/carnet";
import type { DrawnReward, RewardTierId } from "@/lib/types";

const WISHLISTS: { tier: RewardTierId; label: string; rows: number; placeholder: string }[] = [
  {
    tier: "commun",
    label: "Liste Commune / Peu Commune (séparés par ;)",
    rows: 3,
    placeholder: "ex. Un petit bijou fantaisie ; Un jeu d'occasion ; Un snack plaisir",
  },
  { tier: "rare", label: "Liste Rare (séparés par ;)", rows: 2, placeholder: "ex. Un accessoire un peu plus cher ; Un jeu en promo" },
  {
    tier: "ultrarare",
    label: "Liste Ultra-rare (séparés par ;)",
    rows: 2,
    placeholder: "ex. La pièce que tu convoites depuis des mois ; Un DLC complet",
  },
  {
    tier: "legendaire",
    label: "Liste Légendaire (séparés par ;)",
    rows: 2,
    placeholder: "ex. Une sortie exceptionnelle ; Le gros achat que tu remets toujours à plus tard",
  },
];

function WishlistField({ tier, label, rows, placeholder, className }: (typeof WISHLISTS)[number] & { className: string }) {
  const { carnet, act } = useCarnet();
  const field = useSavedText(joinList(carnet.wishlists[tier]), (value) =>
    act("setWishlist", { tier, items: parseList(value) }),
  );
  return (
    <div className={`field ${className}`}>
      <label htmlFor={`wishlist-${tier}`}>{label}</label>
      <textarea
        id={`wishlist-${tier}`}
        rows={rows}
        placeholder={placeholder}
        value={field.value}
        onChange={field.onChange}
        onFocus={field.onFocus}
        onBlur={field.onBlur}
      />
    </div>
  );
}

function Cagnotte() {
  const { carnet, act, busy } = useCarnet();
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [cashLabel, setCashLabel] = useState("");

  const handleAdd = async () => {
    const value = parseFloat(amount);
    if (Number.isNaN(value) || value <= 0) return;
    try {
      await act("addToCagnotte", { label: label.trim(), amount: value });
      setLabel("");
      setAmount("");
    } catch {}
  };

  const handleCashOut = async () => {
    try {
      await act("cashOutCagnotte", { description: cashLabel.trim() });
      setCashLabel("");
    } catch {}
  };

  return (
    <div className="panel">
      <h2>Cagnotte de Récompenses</h2>
      <p className="hint">
        Une récompense obtenue mais non utilisée ? Note-la ici avec la valeur que tu lui donnes, et cumule jusqu&apos;à
        pouvoir encaisser quelque chose de plus gros.
      </p>
      <div className="level-row">
        <span className="lvl">Cagnotte</span>
        <span className="xp-num">{carnet.cagnotte.total}</span>
      </div>
      <div className="identity cols-2-1-1">
        <div className="field">
          <label htmlFor="cagnotteLabel">Récompense mise de côté</label>
          <input
            id="cagnotteLabel"
            type="text"
            placeholder="ex. Butin Commun non utilisé"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="cagnotteAmount">Valeur</label>
          <input id="cagnotteAmount" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <button type="button" className="roll-btn compact" disabled={busy} onClick={handleAdd}>
          Ajouter
        </button>
      </div>
      <div className="mb-16">
        {carnet.cagnotte.entries.length === 0 ? (
          <div className="empty-log">Rien dans la cagnotte pour l&apos;instant.</div>
        ) : (
          carnet.cagnotte.entries.map((e) => (
            <div className="log-entry" key={e.id}>
              <span>{e.label}</span>
              <span className="ldate">
                {new Date(e.at).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })} · +{e.amount}
              </span>
            </div>
          ))
        )}
      </div>
      <div className="field">
        <label htmlFor="cagnotteCashLabel">Contre quoi encaisser ?</label>
        <input
          id="cagnotteCashLabel"
          type="text"
          placeholder="ex. Sortie spéciale, gros achat..."
          value={cashLabel}
          onChange={(e) => setCashLabel(e.target.value)}
        />
      </div>
      <button type="button" className="roll-btn mt-sm" disabled={busy || carnet.cagnotte.total <= 0} onClick={handleCashOut}>
        Encaisser la cagnotte
      </button>
    </div>
  );
}

export function RecompensesTab() {
  const { carnet, act, busy } = useCarnet();
  const [rolling, setRolling] = useState(false);
  const [face, setFace] = useState("?");
  const [result, setResult] = useState<DrawnReward | null>(null);
  const [rolls, setRolls] = useState(0);
  const interval = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearInterval(interval.current), []);

  const pending = carnet.progress.pendingRewards;

  const roll = (isReroll: boolean) => {
    if (rolling) return;
    if (isReroll ? !carnet.rerollAvailable : pending <= 0) return;
    setRolling(true);
    // Le tirage se fait côté serveur pendant que le dé roule ; on montre le résultat à la fin des deux.
    const drawn = act<DrawnReward>("drawReward", { reroll: isReroll });
    const spun = new Promise<void>((resolve) => {
      let ticks = 0;
      interval.current = window.setInterval(() => {
        setFace(String(1 + Math.floor(Math.random() * 6)));
        if (++ticks > 8) {
          window.clearInterval(interval.current);
          resolve();
        }
      }, 90);
    });
    Promise.all([drawn, spun]).then(
      ([reward]) => {
        setResult(reward);
        setRolls((n) => n + 1);
        setRolling(false);
      },
      () => {
        window.clearInterval(interval.current);
        setRolling(false);
      },
    );
  };

  const resultTier = result ? tierOf(result.tier) : null;
  const diceFace = rolling ? face : (resultTier?.symbol ?? "?");
  const tierClass = resultTier && resultTier.tier !== "commun" ? ` ${resultTier.tier}` : "";

  return (
    <>
      <div className="panel">
        <h2>Sanctuaire de la Récompense</h2>
        <div className="dice-zone">
          <div className={`d6${rolling ? " rolling" : ""}`}>{diceFace}</div>
          <button type="button" className="roll-btn" disabled={rolling || busy || pending <= 0} onClick={() => roll(false)}>
            {pending > 0 ? `Lancer le dé (${pending} en attente)` : "Lancer le dé"}
          </button>
          {result && resultTier && (
            <div className={`reward-card${tierClass}`} key={rolls}>
              <div className={`tier-badge ${resultTier.tier}`}>{resultTier.label}</div>
              <div className="rname">{result.name}</div>
              <div className="rdesc">{result.description ?? emptyWishlistText(resultTier)}</div>
            </div>
          )}
          {carnet.rerollAvailable && (
            <button type="button" className="reroll-btn" disabled={rolling || busy} onClick={() => roll(true)}>
              Retirer la dernière récompense
            </button>
          )}
        </div>

        {WISHLISTS.map((w, i) => (
          <WishlistField key={w.tier} {...w} className={i === 0 ? "mt-lg" : "mt"} />
        ))}
      </div>

      <Cagnotte />
    </>
  );
}
