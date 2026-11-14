import Link from "next/link";
import { Button } from "@/components/Button";

const MESSAGES: Record<string, string> = {
  email: "Cette adresse e-mail n'est pas valide.",
  envoi: "L'e-mail n'a pas pu partir. Réessaie dans un instant.",
  lien: "Ce lien a expiré ou a déjà servi. Demande-en un nouveau.",
};

// Mot de passe oublié (ou jamais choisi) : un lien par e-mail mène à /login/nouveau.
export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { sent, error } = await searchParams;

  return (
    <div className="panel">
      <h2>Mot de passe oublié</h2>
      {sent ? (
        <p className="hint">
          Si un carnet existe pour cette adresse, un lien pour choisir un nouveau mot de passe vient de partir. Ouvre-le
          dans ce navigateur.
        </p>
      ) : (
        <form method="post" action="/auth/reset">
          <p className="hint">Indique ton adresse : tu recevras un lien pour choisir un nouveau mot de passe.</p>
          <div className="field mb">
            <label htmlFor="email">Adresse e-mail</label>
            <input id="email" name="email" type="email" autoComplete="email" required maxLength={254} />
          </div>
          <Button type="submit" center>
            Recevoir le lien
          </Button>
        </form>
      )}
      {error && MESSAGES[error] && <div className="feedback">⚠ {MESSAGES[error]}</div>}
      <div className="auth-links">
        <Link href="/login">Retour à la connexion</Link>
      </div>
    </div>
  );
}
