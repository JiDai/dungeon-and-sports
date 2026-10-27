import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Côté serveur uniquement : un client Supabase par requête, porteur de la session de l'utilisateur (cookies).
// Clé publishable : les droits sont ceux de l'utilisateur connecté (rôle authenticated, RLS et
// sport.assert_player), jamais ceux de la clé secrète.

export function supabaseConfig(): { url: string; key: string } {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL et SUPABASE_PUBLISHABLE_KEY doivent être définis (voir .env.example)");
  return { url, key };
}

export async function supabaseServer() {
  const { url, key } = supabaseConfig();
  const store = await cookies();
  return createServerClient(url, key, {
    db: { schema: "sport" },
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Rendu d'une page : les cookies ne s'y écrivent pas, le proxy rafraîchit la session.
        }
      },
    },
  });
}
