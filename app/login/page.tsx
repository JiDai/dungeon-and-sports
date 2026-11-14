import Link from "next/link";
import { Button } from "@/components/Button";
import { PASSWORD_MAX } from "@/lib/auth";

const MESSAGES: Record<string, string> = {
  email: "Cette adresse e-mail n'est pas valide.",
  identifiants: "Adresse e-mail ou mot de passe incorrect.",
  service: "La connexion n'a pas abouti. Réessaie dans un instant.",
  lien: "Ce lien a expiré ou a déjà servi. Demande-en un nouveau.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { error } = await searchParams;

  return (
    <div className="panel">
      <h2>Ouvrir le carnet</h2>
      <form method="post" action="/auth/password">
        <div className="field mb">
          <label htmlFor="email">Adresse e-mail</label>
          <input id="email" name="email" type="email" autoComplete="username" required maxLength={254} />
        </div>
        <div className="field mb">
          <label htmlFor="password">Mot de passe</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required maxLength={PASSWORD_MAX} />
        </div>
        <Button type="submit" center>
          Se connecter
        </Button>
      </form>
      {error && MESSAGES[error] && <div className="feedback">⚠ {MESSAGES[error]}</div>}
      <div className="auth-links">
        <Link href="/login/oubli">Mot de passe oublié ?</Link>
        <Link href="/login/lien">Recevoir un lien de connexion par e-mail</Link>
      </div>
    </div>
  );
}
