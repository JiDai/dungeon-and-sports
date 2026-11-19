import { timingSafeEqual } from "node:crypto";
import { parseSubscription, sendToSubscriptions, type StoredSubscription } from "@/lib/push";

// Livraison des rappels quotidiens. Appelée par la base (pg_cron + pg_net, voir la migration
// 20261119000100_rappels_quotidiens.sql), jamais par un navigateur : la base choisit qui reçoit quoi, cette
// route signe et chiffre les messages avec la clé VAPID, puis répond les abonnements morts, que la base oublie.
//
// POST, en-tête Authorization: Bearer <CRON_SECRET>, corps { messages: [{ title, body, url?, tag?, subscriptions }] }.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_MESSAGES = 1000;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);

export async function POST(req: Request) {
  if (!authorized(req)) return new Response(null, { status: 401 });
  let body: { messages?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON invalide" }, { status: 400 });
  }
  if (!Array.isArray(body.messages) || body.messages.length > MAX_MESSAGES) {
    return Response.json({ error: "messages invalides" }, { status: 400 });
  }

  let sent = 0;
  const dead: string[] = [];
  await Promise.all(
    body.messages.map(async (raw: Record<string, unknown>) => {
      const subscriptions: StoredSubscription[] = [];
      for (const s of Array.isArray(raw?.subscriptions) ? raw.subscriptions : []) {
        // Même forme que PushSubscription.toJSON(), pour réutiliser la validation de l'abonnement.
        try {
          subscriptions.push(parseSubscription({ endpoint: s?.endpoint, keys: { p256dh: s?.p256dh, auth: s?.auth } }));
        } catch {
          // Abonnement mal formé : ignoré.
        }
      }
      const result = await sendToSubscriptions(subscriptions, {
        title: text(raw?.title, 120) ?? "Carnet de Cendres",
        body: text(raw?.body, 300) ?? "",
        url: text(raw?.url, 200)?.startsWith("/") ? text(raw?.url, 200) : "/",
        tag: text(raw?.tag, 60),
      });
      sent += result.sent;
      dead.push(...result.dead);
    }),
  );
  return Response.json({ sent, dead });
}
