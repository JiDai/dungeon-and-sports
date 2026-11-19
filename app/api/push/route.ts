import { CarnetError, openSession } from "@/lib/db";
import { isSameOrigin } from "@/lib/http";
import {
  deleteSubscription,
  getReminderTime,
  notifyPlayer,
  parseSubscription,
  saveSubscription,
  setReminderTime,
} from "@/lib/push";

// Les notifications de l'utilisateur connecté. GET : { reminderTime }. POST { action, … } :
//  - subscribe { subscription } : enregistre l'abonnement push de cet appareil ;
//  - unsubscribe { endpoint } : l'oublie ;
//  - test : envoie une notification d'essai à tous ses appareils ;
//  - reminder { time } : règle l'heure du rappel quotidien (« HH:MM », ou null pour le couper).
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET() {
  try {
    const session = await openSession();
    if (!session) return json({ error: "Session expirée : reconnecte-toi." }, 401);
    return json({ reminderTime: await getReminderTime(session) });
  } catch (e) {
    console.error(e);
    return json({ error: "Supabase ne répond pas." }, 502);
  }
}

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return new Response(null, { status: 403 });
  let body: { action?: unknown; subscription?: unknown; endpoint?: unknown; time?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON invalide" }, 400);
  }
  try {
    const session = await openSession();
    if (!session) return json({ error: "Session expirée : reconnecte-toi." }, 401);
    switch (body.action) {
      case "subscribe":
        await saveSubscription(session, parseSubscription(body.subscription), req.headers.get("user-agent") ?? "");
        return json({ ok: true });
      case "unsubscribe":
        if (typeof body.endpoint !== "string" || body.endpoint.length > 2048) return json({ error: "Adresse invalide" }, 400);
        await deleteSubscription(session, body.endpoint);
        return json({ ok: true });
      case "test": {
        const sent = await notifyPlayer(session, {
          title: "Le carnet t'appelle",
          body: "Les notifications fonctionnent. Tes quêtes du jour t'attendent.",
          url: "/",
          tag: "test",
        });
        return json({ sent });
      }
      case "reminder":
        return json({ reminderTime: await setReminderTime(session, body.time ?? null) });
      default:
        return json({ error: "Action inconnue" }, 400);
    }
  } catch (e) {
    if (e instanceof CarnetError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: "Envoi impossible pour le moment." }, 502);
  }
}
