"use client";

import { useEffect, useState } from "react";
import { Button } from "./Button";

// Active les notifications sur cet appareil. Sur iPhone et iPad, Safari n'offre le push qu'à une app
// ajoutée à l'écran d'accueil : on guide d'abord cette installation.

type Status = "loading" | "unsupported" | "install" | "denied" | "off" | "on";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

/** Heure proposée à l'activation, si aucun rappel n'est encore réglé. */
const DEFAULT_REMINDER = "19:00";
/** Les heures de rappel possibles : un quart d'heure, de 5 h à 23 h 45 (la base arrondit pareil). */
const REMINDER_TIMES = Array.from({ length: 19 * 4 }, (_, i) => {
  const minutes = 5 * 60 + i * 15;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});
const formatTime = (t: string) => t.replace(":", " h ").replace(" h 00", " h");

const isIos = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/** La clé publique VAPID (base64url) sous la forme attendue par pushManager.subscribe. */
function decodeKey(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function post(body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Le serveur ne répond pas.");
  return data;
}

export function NotificationsPanel() {
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  // undefined : pas encore lue ; null : pas de rappel.
  const [reminderTime, setReminderTime] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    void (async () => {
      if (isIos() && !isStandalone()) return setStatus("install");
      if (!pushSupported() || !VAPID_PUBLIC_KEY) return setStatus("unsupported");
      if (Notification.permission === "denied") return setStatus("denied");
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        const sub = await reg.pushManager.getSubscription();
        setStatus(sub && Notification.permission === "granted" ? "on" : "off");
      } catch {
        setStatus("unsupported");
      }
    })();
  }, []);

  useEffect(() => {
    if (status !== "on" || reminderTime !== undefined) return;
    void fetch("/api/push", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error())))
      .then((data: { reminderTime: string | null }) => setReminderTime(data.reminderTime))
      .catch(() => setFeedback("Impossible de lire l'heure du rappel."));
  }, [status, reminderTime]);

  const saveReminder = async (time: string | null) => {
    const { reminderTime: saved } = await post({ action: "reminder", time });
    setReminderTime(saved as string | null);
    return saved as string | null;
  };

  const changeReminder = (time: string | null) =>
    run(async () => {
      const saved = await saveReminder(time);
      setFeedback(saved ? `Rappel chaque jour à ${formatTime(saved)}.` : "Rappel quotidien coupé.");
    });

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setFeedback("");
    try {
      await task();
    } catch (e) {
      setFeedback((e as Error).message || "Ça n'a pas marché.");
    } finally {
      setBusy(false);
    }
  };

  // La demande de permission doit partir directement d'un tap : iOS la refuse sinon.
  const enable = () =>
    run(async () => {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(VAPID_PUBLIC_KEY) }));
      await post({ action: "subscribe", subscription: sub.toJSON() });
      // Un rappel réglé d'office, pour que l'activation suffise ; l'heure se change juste en dessous.
      const { reminderTime: current } = (await fetch("/api/push", { cache: "no-store" }).then((r) => r.json())) as {
        reminderTime: string | null;
      };
      const time = current ?? (await saveReminder(DEFAULT_REMINDER));
      setReminderTime(time);
      setStatus("on");
      setFeedback(
        time ? `Notifications activées : rappel chaque jour à ${formatTime(time)}.` : "Notifications activées sur cet appareil.",
      );
    });

  const disable = () =>
    run(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await post({ action: "unsubscribe", endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setStatus("off");
      setFeedback("Notifications coupées sur cet appareil.");
    });

  const test = () =>
    run(async () => {
      const { sent } = await post({ action: "test" });
      setFeedback(sent ? "Notification envoyée : elle arrive dans quelques secondes." : "Aucun appareil abonné n'a répondu.");
    });

  return (
    <div className="panel">
      <h2>Notifications</h2>
      {status === "loading" && <p className="hint">…</p>}

      {status === "install" && (
        <>
          <p className="hint">
            Sur iPhone, les notifications ne marchent qu&apos;une fois le carnet installé sur l&apos;écran d&apos;accueil :
          </p>
          <ol className="help-list steps">
            <li>
              Dans Safari, touche <strong>Partager</strong> (le carré avec une flèche vers le haut).
            </li>
            <li>
              Choisis <strong>Sur l&apos;écran d&apos;accueil</strong>, puis <strong>Ajouter</strong>.
            </li>
            <li>Ouvre le carnet depuis sa nouvelle icône et reviens sur cette fiche pour activer les notifications.</li>
          </ol>
        </>
      )}

      {status === "unsupported" && (
        <p className="hint">Ce navigateur ne sait pas recevoir de notifications (sur iPhone, il faut iOS 16.4 ou plus).</p>
      )}

      {status === "denied" && (
        <p className="hint">
          Les notifications sont bloquées pour le carnet. Réactive-les dans les réglages de l&apos;appareil
          {typeof window !== "undefined" && isIos() ? " (Réglages → Notifications → Carnet)" : " ou du navigateur"}, puis
          reviens ici.
        </p>
      )}

      {status === "off" && (
        <>
          <p className="hint">
            Reçois un rappel une fois par jour, à l&apos;heure de ton choix, si tu n&apos;as encore rien validé.
          </p>
          <div className="btn-row">
            <Button onClick={() => void enable()} disabled={busy}>
              Activer les notifications
            </Button>
          </div>
        </>
      )}

      {status === "on" && (
        <>
          <p className="hint">Les notifications sont actives sur cet appareil.</p>
          <div className="field mb">
            <label htmlFor="reminderTime">Rappel quotidien</label>
            <select
              id="reminderTime"
              value={reminderTime ?? ""}
              disabled={busy || reminderTime === undefined}
              onChange={(e) => void changeReminder(e.target.value || null)}
            >
              <option value="">Pas de rappel</option>
              {reminderTime && !REMINDER_TIMES.includes(reminderTime) && (
                <option value={reminderTime}>{formatTime(reminderTime)}</option>
              )}
              {REMINDER_TIMES.map((t) => (
                <option key={t} value={t}>
                  {formatTime(t)}
                </option>
              ))}
            </select>
          </div>
          <p className="hint">
            Le rappel ne part que si rien n&apos;est validé ce jour-là. Il arrive sur tous tes appareils où les
            notifications sont actives.
          </p>
          <div className="btn-row">
            <Button variant="secondary" onClick={() => void test()} disabled={busy}>
              M&apos;envoyer un essai
            </Button>
            <Button variant="link" onClick={() => void disable()} disabled={busy}>
              Couper sur cet appareil
            </Button>
          </div>
        </>
      )}

      {feedback && <div className="feedback">{feedback}</div>}
    </div>
  );
}
