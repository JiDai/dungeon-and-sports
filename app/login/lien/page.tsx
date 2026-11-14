import Link from "next/link";
import { Button } from "@/components/Button";

const MESSAGES: Record<string, string> = {
  email: "Cette adresse e-mail n'est pas valide.",
  envoi: "L'e-mail n'a pas pu partir. Réessaie dans un instant.",
};

// Connexion secondaire : un lien à usage unique envoyé par e-mail, sans mot de passe.
export default async function MagicLinkPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { sent, error } = await searchParams;

  return (
    <div className="panel">
      <h2>Lien de connexion</h2>
      {sent ? (
        <p className="hint">
          Si un carnet existe pour cette adresse, un lien de connexion vient de partir. Ouvre-le dans ce navigateur.
        </p>
      ) : (
        <form method="post" action="/auth/login">
          <p className="hint">Pas de mot de passe : un lien à usage unique t&apos;ouvre le carnet.</p>
          <div className="field mb">
            <label htmlFor="email">Adresse e-mail</label>
            <input id="email" name="email" type="email" autoComplete="email" required maxLength={254} />
          </div>
          <Button type="submit" center>
            Recevoir un lien de connexion
          </Button>
        </form>
      )}
      {error && MESSAGES[error] && <div className="feedback">⚠ {MESSAGES[error]}</div>}
      <div className="auth-links">
        <Link href="/login">Se connecter avec un mot de passe</Link>
      </div>
    </div>
  );
}
