import { CarnetError, exportCarnet, getCarnet, runAction } from "@/lib/db";

// Le carnet dans Supabase (schéma sport). GET : l'état affiché, ou l'export complet avec ?export.
// POST { action, args } : une action du jeu ; renvoie son résultat et le carnet à jour.
export const dynamic = "force-dynamic";

const LOOPBACK_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|[a-z0-9-]+\.localhost)(:\d+)?$/i;

/** N'accepte que les requêtes locales et same-origin (pas d'accès réseau, pas de CSRF ni de DNS rebinding). */
function isLocalRequest(req: Request): boolean {
  const host = req.headers.get("host") ?? "";
  if (!LOOPBACK_HOST.test(host)) return false;
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function failure(e: unknown): Response {
  if (e instanceof CarnetError) return Response.json({ error: e.message }, { status: e.status });
  console.error(e);
  return Response.json({ error: "Supabase ne répond pas." }, { status: 502 });
}

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: Request) {
  if (!isLocalRequest(req)) return new Response(null, { status: 403 });
  try {
    if (new URL(req.url).searchParams.has("export")) {
      return Response.json(await exportCarnet(), {
        headers: { ...NO_STORE, "Content-Disposition": 'attachment; filename="carnet-de-cendres.json"' },
      });
    }
    return Response.json(await getCarnet(), { headers: NO_STORE });
  } catch (e) {
    return failure(e);
  }
}

export async function POST(req: Request) {
  if (!isLocalRequest(req)) return new Response(null, { status: 403 });
  let body: { action?: unknown; args?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON invalide" }, { status: 400 });
  }
  if (typeof body.action !== "string") return Response.json({ error: "Action manquante" }, { status: 400 });
  const args = body.args && typeof body.args === "object" ? (body.args as Record<string, unknown>) : {};
  try {
    const result = await runAction(body.action, args);
    return Response.json({ result, carnet: await getCarnet() }, { headers: NO_STORE });
  } catch (e) {
    return failure(e);
  }
}
