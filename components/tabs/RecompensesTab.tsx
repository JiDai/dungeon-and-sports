"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCarnet } from "../CarnetProvider";
import { DiceRollOverlay } from "../DiceRollOverlay";
import { Coin } from "../Coin";
import { TierSymbol } from "../TierSymbol";
import { emptyWishlistText, formatAmount, tierOf } from "@/lib/carnet";
import { REWARD_TIERS } from "@/lib/data";
import type { DrawnReward, RewardTierId, WishlistItem } from "@/lib/types";
import { Button } from "../Button";

const PLACEHOLDERS: Record<RewardTierId, string> = {
  commun: "ex. Un snack plaisir",
  rare: "ex. Un jeu en promo",
  ultrarare: "ex. Un DLC complet",
  legendaire: "ex. Le gros achat que tu remets toujours à plus tard",
};

/** Lit un montant saisi : "" → null, "12,5" → 12.5 ; undefined si la saisie n'est pas un montant positif. */
function parseAmount(raw: string): number | null | undefined {
  const s = raw.trim().replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Libellé + montant, pour ajouter un élément ou en modifier un. */
function WishlistItemForm({
  tier,
  item,
  onDone,
}: {
  tier: RewardTierId;
  item?: WishlistItem;
  onDone?: () => void;
}) {
  const { act, busy } = useCarnet();
  const [label, setLabel] = useState(item?.label ?? "");
  const [amount, setAmount] = useState(item?.amount == null ? "" : String(item.amount));
  const [error, setError] = useState<string | null>(null);
  const idPrefix = item ? `wish-${item.id}` : `wish-new-${tier}`;
  // Le formulaire s'ouvre sur un clic (Ajouter, ✎) : le curseur va directement au libellé.
  const labelRef = useRef<HTMLInputElement>(null);
  useEffect(() => labelRef.current?.focus(), []);

  const submit = async () => {
    const value = parseAmount(amount);
    if (!label.trim()) return setError("Donne un nom à la récompense.");
    if (value === undefined) return setError("Le montant doit être un nombre positif, ou vide.");
    try {
      if (item) await act("updateWishlistItem", { id: item.id, label: label.trim(), amount: value });
      else await act("addWishlistItem", { tier, label: label.trim(), amount: value });
      setError(null);
      onDone?.();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <form
      className="wish-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="wish-grid">
        <div className="field">
          <label htmlFor={`${idPrefix}-label`}>{item ? "Récompense" : "Nouvelle récompense"}</label>
          <input
            id={`${idPrefix}-label`}
            type="text"
            ref={labelRef}
            maxLength={200}
            placeholder={PLACEHOLDERS[tier]}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`${idPrefix}-amount`}>Montant cagnottable</label>
          <input
            id={`${idPrefix}-amount`}
            type="text"
            inputMode="decimal"
            placeholder="ex. 5"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="wish-buttons">
          <Button type="submit" className="btn-compact" disabled={busy}>
            {item ? "Enregistrer" : "Ajouter"}
          </Button>
          <Button variant="outline" className="btn-compact" disabled={busy} onClick={onDone}>
            Annuler
          </Button>
        </div>
      </div>
      {error && <p className="feedback">{error}</p>}
    </form>
  );
}

function Wishlist({ tier }: { tier: RewardTierId }) {
  const { carnet, act, busy } = useCarnet();
  const [editing, setEditing] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const { list, butin } = tierOf(tier);
  const items = carnet.wishlists[tier] ?? [];

  return (
    <div className="skill-block wish-block">
      <h3 className="wishlist-label">
        <TierSymbol tier={tier} />
        Liste des {list} ({butin})
      </h3>
      <ul className="skill-items">
        {items.length === 0 && <li className="wish-empty">Rien dans cette liste pour l&apos;instant.</li>}
        {items.map((item) =>
          editing === item.id ? (
            <li key={item.id} className="ex-editing">
              <WishlistItemForm tier={tier} item={item} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={item.id}>
              <span>{item.label}</span>
              <span className="sxp">
                {item.amount == null ? (
                  "—"
                ) : (
                  <>
                    <Coin className="coin-inline" />
                    {formatAmount(item.amount)}
                  </>
                )}{" "}
                <button type="button" className="ex-del" title="Modifier" disabled={busy} onClick={() => setEditing(item.id)}>
                  ✎
                </button>
                <button
                  type="button"
                  className="ex-del"
                  title="Retirer"
                  disabled={busy}
                  onClick={() => act("archiveWishlistItem", { id: item.id }).catch(() => {})}
                >
                  ✕
                </button>
              </span>
            </li>
          ),
        )}
      </ul>
      {adding ? (
        <WishlistItemForm tier={tier} onDone={() => setAdding(false)} />
      ) : (
        <Button variant="outline" className="btn-compact" disabled={busy} onClick={() => setAdding(true)}>
          + Ajouter une récompense
        </Button>
      )}
    </div>
  );
}

function WonRewards() {
  const { carnet, act, busy } = useCarnet();
  const won = carnet.wonRewards ?? [];
  if (won.length === 0) return null;
  return (
    <>
      <h3>Récompenses gagnées</h3>
      <p className="hint">Prends-la tout de suite, ou mets son montant de côté dans la cagnotte.</p>
      <ul className="skill-items won-rewards">
        {won.map((r) => (
          <li key={r.id}>
            <span>
              <TierSymbol tier={r.tier} className="log-tier" />
              {r.description ?? r.name}
              <small>{r.description ? r.name : "liste vide : un plaisir libre"}</small>
            </span>
            <span className="won-actions">
              <Button variant="outline" disabled={busy} onClick={() => act("takeReward", { id: r.id }).catch(() => {})}>
                Prendre
              </Button>
              <Button
                variant="secondary"
                disabled={busy || r.amount == null}
                title={r.amount == null ? "Pas de montant pour cette récompense" : undefined}
                onClick={() => act("bankReward", { id: r.id }).catch(() => {})}
              >
                Cagnotter
                {r.amount != null && (
                  <span>
                    +<Coin className="coin-inline coin-after" />
                    {formatAmount(r.amount)}
                  </span>
                )}
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

function Cagnotte() {
  const { carnet, act, busy } = useCarnet();
  const [cashLabel, setCashLabel] = useState("");

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
        Chaque récompense gagnée au dé arrive ici. Prends-la, ou cagnotte-la pour cumuler jusqu&apos;à pouvoir encaisser
        quelque chose de plus gros.
      </p>
      <WonRewards />
      <div className="level-row mt-16">
        <span className="lvl">Cagnotte</span>
        <span className="cagnotte-total">
          <Coin className="coin-inline" />
          {formatAmount(carnet.cagnotte.total)}
        </span>
      </div>
      <div className="mb-16">
        {carnet.cagnotte.entries.length === 0 ? (
          <div className="empty-log">Rien dans la cagnotte pour l&apos;instant.</div>
        ) : (
          carnet.cagnotte.entries.map((e) => (
            <div className="log-entry" key={e.id}>
              <span>{e.label}</span>
              <span className="lxp">+{formatAmount(e.amount)}</span>
              <span className="ldate">
                {new Date(e.at).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}
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
              {carnet.wonRewards.some((w) => w.id === result.id) && (
                <div className="rnext">
                  {result.amount != null && (
                    <>
                      <Coin className="coin-inline" />
                      {formatAmount(result.amount)} ·{" "}
                    </>
                  )}
                  À prendre ou cagnotter, plus bas.
                </div>
              )}
            </div>
          )}
          {carnet.rerollAvailable && (
            <Button variant="outline" center className="mt-14" disabled={rolling || busy} onClick={() => roll(true)}>
              Retirer la dernière récompense
            </Button>
          )}
        </div>
      </div>

      <Cagnotte />

      <div className="panel">
        <h2>Listes de Butin</h2>
        <p className="hint">
          Le dé tire une récompense au hasard dans la liste de son rang. Donne-lui un montant pour pouvoir la cagnotter.
        </p>
        {REWARD_TIERS.map((t) => (
          <Wishlist key={t.tier} tier={t.tier} />
        ))}
      </div>
      {overlay && <DiceRollOverlay reward={overlay.reward} onDone={endOverlay} />}
    </>
  );
}
