import webpush, { WebPushError } from "web-push";
import { CarnetError, type Session } from "./db";

// Côté serveur uniquement : les notifications Web Push (iOS 16.4+ une fois l'app sur l'écran d'accueil,
// Android, ordinateur). Les messages partent signés par les clés VAPID de l'app, chiffrés pour chaque appareil.

export interface PushMessage {
  title: string;
  body: string;
  /** Page ouverte au tap sur la notification. */
  url?: string;
  /** Une notification de même tag remplace la précédente au lieu de s'empiler. */
  tag?: string;
}

export interface StoredSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

let configured = false;
function configure() {
  if (configured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    throw new Error("NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY et VAPID_SUBJECT doivent être définis (voir .env.example)");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

const bad = (what: string) => new CarnetError(`Abonnement invalide : ${what}`, 400);

/** Vérifie un abonnement envoyé par le navigateur (PushSubscription.toJSON()). */
export function parseSubscription(raw: unknown): StoredSubscription {
  const s = raw as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  const endpoint = s?.endpoint;
  if (typeof endpoint !== "string" || endpoint.length > 2048 || !endpoint.startsWith("https://")) throw bad("adresse");
  const { p256dh, auth } = s?.keys ?? {};
  if (typeof p256dh !== "string" || !p256dh || p256dh.length > 200) throw bad("clé");
  if (typeof auth !== "string" || !auth || auth.length > 100) throw bad("clé");
  return { endpoint, p256dh, auth };
}

async function rpc(session: Session, fn: string, args: Record<string, unknown>) {
  const { error } = await session.db.rpc(fn, { p_player: session.player, ...args });
  if (error) throw new Error(`Supabase (${fn}) : ${error.message}`);
}

export const saveSubscription = (session: Session, sub: StoredSubscription, userAgent: string) =>
  rpc(session, "save_push_subscription", {
    p_endpoint: sub.endpoint,
    p_p256dh: sub.p256dh,
    p_auth: sub.auth,
    p_user_agent: userAgent.slice(0, 400),
  });

export const deleteSubscription = (session: Session, endpoint: string) =>
  rpc(session, "delete_push_subscription", { p_endpoint: endpoint });

/**
 * Envoie un message à une liste d'appareils. Renvoie le nombre d'appareils atteints et les abonnements que
 * le service de push déclare morts (désinstallation, permission retirée), à oublier.
 */
export async function sendToSubscriptions(
  subscriptions: StoredSubscription[],
  message: PushMessage,
): Promise<{ sent: number; dead: string[] }> {
  configure();
  const payload = JSON.stringify(message);
  const dead: string[] = [];
  let sent = 0;
  await Promise.all(
    subscriptions.map(async (s) => {
      try {
        // TTL : un rappel qui n'a pas pu être livré en 12 h n'a plus d'intérêt.
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
          TTL: 12 * 3600,
          urgency: "normal",
        });
        sent++;
      } catch (e) {
        if (e instanceof WebPushError && (e.statusCode === 404 || e.statusCode === 410)) dead.push(s.endpoint);
        else console.error("Web Push :", e);
      }
    }),
  );
  return { sent, dead };
}

/** Envoie un message à tous les appareils abonnés du joueur connecté. Renvoie le nombre d'appareils atteints. */
export async function notifyPlayer(session: Session, message: PushMessage): Promise<number> {
  const { data, error } = await session.db.from("push_subscription").select("endpoint, p256dh, auth").eq("player_id", session.player);
  if (error) throw new Error(`Supabase (push_subscription) : ${error.message}`);
  const { sent, dead } = await sendToSubscriptions(data as StoredSubscription[], message);
  await Promise.all(dead.map((endpoint) => deleteSubscription(session, endpoint)));
  return sent;
}

/* ---------- Rappel quotidien ---------- */

/** L'heure du rappel quotidien du joueur (« HH:MM »), ou null s'il est coupé. */
export async function getReminderTime(session: Session): Promise<string | null> {
  const { data, error } = await session.db.from("player").select("reminder_time").eq("id", session.player).single();
  if (error) throw new Error(`Supabase (player) : ${error.message}`);
  const time = (data as { reminder_time: string | null }).reminder_time;
  return time ? time.slice(0, 5) : null;
}

export async function setReminderTime(session: Session, time: unknown): Promise<string | null> {
  if (time !== null && (typeof time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) {
    throw new CarnetError("Heure invalide.", 400);
  }
  await rpc(session, "set_reminder_time", { p_time: time });
  return getReminderTime(session);
}
