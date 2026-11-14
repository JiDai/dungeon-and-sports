import { NextResponse } from "next/server";
import { isValidEmail } from "@/lib/auth";
import { appUrl, isSameOrigin } from "@/lib/http";
import { supabaseServer } from "@/lib/supabase";

// Mot de passe oublié : envoie un lien qui ouvre la session puis mène à /login/nouveau.
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return new Response(null, { status: 403 });
  const back = (query: string) => NextResponse.redirect(appUrl(req, `/login/oubli?${query}`), 303);

  const email = String((await req.formData()).get("email") ?? "").trim();
  if (!isValidEmail(email)) return back("error=email");

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: appUrl(req, "/auth/confirm?next=/login/nouveau").toString(),
  });
  // Même réponse que le compte existe ou non : la page ne révèle pas quelles adresses ont un compte.
  if (error && error.status !== 400 && error.status !== 422) {
    console.error("Mot de passe oublié :", error.message);
    return back("error=envoi");
  }
  return back("sent=1");
}
