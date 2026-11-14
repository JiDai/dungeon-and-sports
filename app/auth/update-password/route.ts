import { NextResponse } from "next/server";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/auth";
import { appUrl, isSameOrigin } from "@/lib/http";
import { supabaseServer } from "@/lib/supabase";

// Enregistre le nouveau mot de passe de l'utilisateur connecté (arrivé par le lien « mot de passe oublié »).
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return new Response(null, { status: 403 });
  const back = (query: string) => NextResponse.redirect(appUrl(req, `/login/nouveau?${query}`), 303);

  const form = await req.formData();
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  if (password.length < PASSWORD_MIN) return back("error=court");
  if (password.length > PASSWORD_MAX) return back("error=long");
  if (password !== confirm) return back("error=different");

  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return NextResponse.redirect(appUrl(req, "/login/oubli?error=lien"), 303);

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === "same_password") return back("error=identique");
    if (error.code === "weak_password") return back("error=court");
    console.error("Nouveau mot de passe :", error.message);
    return back("error=service");
  }
  return NextResponse.redirect(appUrl(req, "/"), 303);
}
