const MESSAGES: Record<string, string> = {
  email: "Cette adresse e-mail n'est pas valide.",
  envoi: "L'e-mail n'a pas pu partir. Réessaie dans un instant.",
  lien: "Ce lien a expiré ou a déjà servi. Demande-en un nouveau.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { sent, error } = await searchParams;

  return (
    <div className="wrap">
      <div className="emblem">
        <h1>Carnet de Cendres</h1>
        <p>« On ne se relève pas parce que c&apos;est facile. On se relève parce qu&apos;on l&apos;a déjà fait. »</p>
      </div>
      <div className="panel">
        <h2>Ouvrir le carnet</h2>
        {sent ? (
          <p className="hint">
            Si un carnet existe pour cette adresse, un lien de connexion vient de partir. Ouvre-le dans ce navigateur.
          </p>
        ) : (
          <form method="post" action="/auth/login">
            <div className="field mb">
              <label htmlFor="email">Adresse e-mail</label>
              <input id="email" name="email" type="email" autoComplete="email" required maxLength={254} />
            </div>
            <button type="submit" className="roll-btn">
              Recevoir un lien de connexion
            </button>
          </form>
        )}
        {error && MESSAGES[error] && <div className="feedback">⚠ {MESSAGES[error]}</div>}
      </div>
    </div>
  );
}
