// Côté serveur : protections communes des routes.

/** Refuse les requêtes envoyées depuis un autre site (CSRF) : l'en-tête Origin, s'il est présent, doit être le nôtre. */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}
