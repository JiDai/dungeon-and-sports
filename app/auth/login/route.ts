import { NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/http";
import { supabaseServer } from "@/lib/supabase";

// Envoie un lien de connexion par e-mail. Seuls les comptes existants le reçoivent (shouldCreateUser: false) :
// le compte se crée avec `pnpm link-player <e-mail>`.
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return new Response(null, { status: 403 });
  const back = (query: string) => NextResponse.redirect(new URL(`/login?${query}`, req.url), 303);

  const email = String((await req.formData()).get("email") ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return back("error=email");

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: new URL("/auth/confirm", req.url).toString(), shouldCreateUser: false },
  });
  // Même réponse que le compte existe ou non : la page ne révèle pas quelles adresses ont un compte.
  if (error && error.status !== 400 && error.status !== 422) {
    console.error("Connexion :", error.message);
    return back("error=envoi");
  }
  return back("sent=1");
}
