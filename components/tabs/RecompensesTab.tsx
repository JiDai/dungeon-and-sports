"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCarnet, useSavedText } from "../CarnetProvider";
import { DiceRollOverlay } from "../DiceRollOverlay";
import { TierSymbol } from "../TierSymbol";
import { emptyWishlistText, joinList, parseList, tierOf } from "@/lib/carnet";
import { REWARD_TIERS } from "@/lib/data";
import type { DrawnReward, RewardTierId } from "@/lib/types";
import { Button } from "../Button";

const WISHLISTS: { tier: RewardTierId; rows: number; placeholder: string }[] = [
  { tier: "commun", rows: 3, placeholder: "ex. Un petit bijou fantaisie ; Un jeu d'occasion ; Un snack plaisir" },
  { tier: "rare", rows: 2, placeholder: "ex. Un accessoire un peu plus cher ; Un jeu en promo" },
  { tier: "ultrarare", rows: 2, placeholder: "ex. La pièce que tu convoites depuis des mois ; Un DLC complet" },
  {
    tier: "legendaire",
    rows: 2,
    placeholder: "ex. Une sortie exceptionnelle ; Le gros achat que tu remets toujours à plus tard",
  },
];

function WishlistField({ tier, rows, placeholder, className }: (typeof WISHLISTS)[number] & { className: string }) {
  const { carnet, act } = useCarnet();
  const { list, butin } = tierOf(tier);
  const field = useSavedText(joinList(carnet.wishlists[tier]), (value) =>
    act("setWishlist", { tier, items: parseList(value) }),
  );
  return (
    <div className={`field ${className}`}>
      <label htmlFor={`wishlist-${tier}`} className="wishlist-label">
        <TierSymbol tier={tier} />
        Liste des {list} ({butin})
      </label>
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
            placeholder="ex. Petite trouvaille non utilisée"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="cagnotteAmount">Valeur</label>
          <input id="cagnotteAmount" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <Button disabled={busy} onClick={handleAdd}>
          Ajouter
        </Button>
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
      <Button center className="mt-12" disabled={busy || carnet.cagnotte.total <= 0} onClick={handleCashOut}>
        Encaisser la cagnotte
      </Button>
    </div>
  );
}

/** En dev seulement : la valeur de `?dice` dans l'URL, ou null. */
function devDiceParam(): string | null {
  if (process.env.NODE_ENV === "production") return null;
  return new URLSearchParams(window.location.search).get("dice");
}

export function RecompensesTab() {
  const { carnet, act, busy } = useCarnet();
  const [rolling, setRolling] = useState(false);
  const [face, setFace] = useState("?");
  const [result, setResult] = useState<DrawnReward | null>(null);
  const [rolls, setRolls] = useState(0);
  const interval = useRef<number | undefined>(undefined);
  // Lancer affiché au centre : reward null tant que le tirage est en cours.
  const [overlay, setOverlay] = useState<{ reward: DrawnReward | null } | null>(() =>
    devDiceParam() === null ? null : { reward: null },
  );
  const endOverlay = useCallback(() => setOverlay(null), []);

  useEffect(() => () => window.clearInterval(interval.current), []);

  // En dev seulement : `?dice` (ou `?dice=legendaire`, `rare`…) rejoue le lancer, sans tirage réel.
  useEffect(() => {
    const wanted = devDiceParam();
    if (wanted === null) return;
    const tier = REWARD_TIERS.find((t) => t.tier === wanted) ?? REWARD_TIERS[Math.floor(Math.random() * REWARD_TIERS.length)];
    const id = window.setTimeout(
      () => setOverlay({ reward: { tier: tier.tier, name: "Récompense de test", description: "Tirage factice (?dice)" } }),
      1200,
    );
    return () => window.clearTimeout(id);
  }, []);

  const pending = carnet.progress.pendingRewards;

  const roll = (isReroll: boolean) => {
    if (rolling) return;
    if (isReroll ? !carnet.rerollAvailable : pending <= 0) return;
    setRolling(true);
    setOverlay({ reward: null });
    // Le tirage se fait côté serveur pendant que le dé roule ; on montre le résultat à la fin des deux.
    const drawn = act<DrawnReward>("drawReward", { reroll: isReroll });
    const spun = new Promise<void>((resolve) => {
      let ticks = 0;
      interval.current = window.setInterval(() => {
        setFace(String(1 + Math.floor(Math.random() * 6)));
        if (++ticks > 12) {
          window.clearInterval(interval.current);
          resolve();
        }
      }, 90);
    });
    Promise.all([drawn, spun]).then(
      ([reward]) => {
        setResult(reward);
        setOverlay({ reward });
        setRolls((n) => n + 1);
        setRolling(false);
      },
      () => {
        window.clearInterval(interval.current);
        setOverlay(null);
        setRolling(false);
      },
    );
  };

  const resultTier = result ? tierOf(result.tier) : null;
  const diceFace = rolling ? face : (resultTier?.symbol ?? "?");
  const tierClass = resultTier ? ` ${resultTier.tier}` : "";

  return (
    <>
      <div className="panel">
        <h2>Sanctuaire de la Récompense</h2>
        <div className="dice-zone">
          <div className={`d6${rolling ? " rolling" : tierClass}`}>{diceFace}</div>
          <Button center disabled={rolling || busy || pending <= 0} onClick={() => roll(false)}>
            {pending > 0 ? `Lancer le dé (${pending} en attente)` : "Lancer le dé"}
          </Button>
          {result && resultTier && (
            <div className={`reward-card${tierClass}`} key={rolls}>
              <div className={`tier-badge ${resultTier.tier}`}>{resultTier.label}</div>
              <div className="rname">{result.name}</div>
              <div className="rdesc">{result.description ?? emptyWishlistText(resultTier)}</div>
            </div>
          )}
          {carnet.rerollAvailable && (
            <Button variant="outline" center className="mt-14" disabled={rolling || busy} onClick={() => roll(true)}>
              Retirer la dernière récompense
            </Button>
          )}
        </div>

        <p className="hint wishlist-hint">
          Une liste par rang de butin, éléments séparés par « ; ».
        </p>
        {WISHLISTS.map((w, i) => (
          <WishlistField key={w.tier} {...w} className={i === 0 ? "" : "mt"} />
        ))}
      </div>

      <Cagnotte />
      {overlay && <DiceRollOverlay reward={overlay.reward} onDone={endOverlay} />}
    </>
  );
}
