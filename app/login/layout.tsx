// En-tête commun aux écrans de connexion (/login, lien magique, mot de passe oublié, nouveau mot de passe).
export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="wrap">
      <div className="emblem">
        <h1>Carnet de Cendres</h1>
        <p>« On ne se relève pas parce que c&apos;est facile. On se relève parce qu&apos;on l&apos;a déjà fait. »</p>
      </div>
      {children}
    </div>
  );
}
