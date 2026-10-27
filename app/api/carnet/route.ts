import { CarnetError, exportCarnet, getCarnet, openSession, runAction } from "@/lib/db";
import { isSameOrigin } from "@/lib/http";

// Le carnet de l'utilisateur connecté (Supabase, schéma sport). GET : l'état affiché, ou l'export complet
// avec ?export. POST { action, args } : une action du jeu ; renvoie son résultat et le carnet à jour.
export const dynamic = "force-dynamic";

const UNAUTHORIZED = () => Response.json({ error: "Session expirée : reconnecte-toi." }, { status: 401 });

function failure(e: unknown): Response {
  if (e instanceof CarnetError) return Response.json({ error: e.message }, { status: e.status });
  console.error(e);
  return Response.json({ error: "Supabase ne répond pas." }, { status: 502 });
}

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: Request) {
  try {
    const session = await openSession();
    if (!session) return UNAUTHORIZED();
    if (new URL(req.url).searchParams.has("export")) {
      return Response.json(await exportCarnet(session), {
        headers: { ...NO_STORE, "Content-Disposition": 'attachment; filename="carnet-de-cendres.json"' },
      });
    }
    return Response.json(await getCarnet(session), { headers: NO_STORE });
  } catch (e) {
    return failure(e);
  }
}

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return new Response(null, { status: 403 });
  let body: { action?: unknown; args?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON invalide" }, { status: 400 });
  }
  if (typeof body.action !== "string") return Response.json({ error: "Action manquante" }, { status: 400 });
  const args = body.args && typeof body.args === "object" ? (body.args as Record<string, unknown>) : {};
  try {
    const session = await openSession();
    if (!session) return UNAUTHORIZED();
    const result = await runAction(session, body.action, args);
    return Response.json({ result, carnet: await getCarnet(session) }, { headers: NO_STORE });
  } catch (e) {
    return failure(e);
  }
}
