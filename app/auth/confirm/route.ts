import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

// Arrivée depuis le lien de l'e-mail : ouvre la session (cookies), puis le carnet.
// `code` : lien standard (PKCE, à ouvrir dans le navigateur qui a demandé le lien).
// `token_hash` + `type` : modèle d'e-mail personnalisé, valable depuis n'importe quel appareil.
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const supabase = await supabaseServer();
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error("Lien incomplet") };

  return NextResponse.redirect(new URL(error ? "/login?error=lien" : "/", req.url), 303);
}
