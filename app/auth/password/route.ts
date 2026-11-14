import { NextResponse } from "next/server";
import { isValidEmail, PASSWORD_MAX } from "@/lib/auth";
import { appUrl, isSameOrigin } from "@/lib/http";
import { supabaseServer } from "@/lib/supabase";

// Connexion par e-mail et mot de passe : ouvre la session (cookies), puis le carnet.
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return new Response(null, { status: 403 });
  const back = (query: string) => NextResponse.redirect(appUrl(req, `/login?${query}`), 303);

  const form = await req.formData();
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!isValidEmail(email)) return back("error=email");
  if (!password || password.length > PASSWORD_MAX) return back("error=identifiants");

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // 400 : identifiants invalides (ou compte sans mot de passe) — même message, rien ne révèle quel cas.
    if (error.status === 400) return back("error=identifiants");
    console.error("Connexion par mot de passe :", error.message);
    return back("error=service");
  }
  return NextResponse.redirect(appUrl(req, "/"), 303);
}
