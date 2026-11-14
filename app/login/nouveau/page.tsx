import Link from "next/link";
import { Button } from "@/components/Button";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase";

const MESSAGES: Record<string, string> = {
  court: `Le mot de passe doit faire au moins ${PASSWORD_MIN} caractères.`,
  long: `Le mot de passe ne doit pas dépasser ${PASSWORD_MAX} caractères.`,
  different: "Les deux mots de passe ne sont pas identiques.",
  identique: "Choisis un mot de passe différent de l'actuel.",
  service: "Le mot de passe n'a pas pu être enregistré. Réessaie dans un instant.",
};

// Choix d'un nouveau mot de passe : on y arrive connecté, par le lien « mot de passe oublié ».
export default async function NewPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { error } = await searchParams;
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) {
    return (
      <div className="panel">
        <h2>Nouveau mot de passe</h2>
        <p className="hint">Ce lien a expiré ou a déjà servi. Demande-en un nouveau.</p>
        <div className="auth-links">
          <Link href="/login/oubli">Mot de passe oublié</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <h2>Nouveau mot de passe</h2>
      <form method="post" action="/auth/update-password">
        {/* Pour les gestionnaires de mots de passe : le compte auquel s'applique le nouveau mot de passe. */}
        <input type="email" name="username" autoComplete="username" value={String(data.claims.email ?? "")} readOnly hidden />
        <div className="field mb">
          <label htmlFor="password">Nouveau mot de passe</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={PASSWORD_MIN}
            maxLength={PASSWORD_MAX}
          />
        </div>
        <div className="field mb">
          <label htmlFor="confirm">Confirme le mot de passe</label>
          <input
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
            minLength={PASSWORD_MIN}
            maxLength={PASSWORD_MAX}
          />
        </div>
        <Button type="submit" center>
          Enregistrer le mot de passe
        </Button>
      </form>
      {error && MESSAGES[error] && <div className="feedback">⚠ {MESSAGES[error]}</div>}
    </div>
  );
}
