// Côté serveur : protections communes des routes.

/**
 * L'adresse publique de l'app, telle que le navigateur l'a demandée (en-têtes Host / X-Forwarded-*).
 * On n'utilise pas req.url : en dev, Next la réécrit en localhost quelle que soit l'adresse ouverte
 * (carnet.localhost, 127.0.0.1…).
 */
export function publicOrigin(req: Request): string {
  const url = new URL(req.url);
  const first = (h: string) => req.headers.get(h)?.split(",")[0].trim() || undefined;
  const host = first("x-forwarded-host") ?? first("host") ?? url.host;
  const proto = first("x-forwarded-proto") ?? url.protocol.slice(0, -1);
  return `${proto}://${host}`;
}

/** Une URL absolue de l'app, sur l'adresse publique. */
export const appUrl = (req: Request, path: string) => new URL(path, publicOrigin(req));

/** Refuse les requêtes envoyées depuis un autre site (CSRF) : l'en-tête Origin, s'il est présent, doit être le nôtre. */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(publicOrigin(req)).host;
  } catch {
    return false;
  }
}
