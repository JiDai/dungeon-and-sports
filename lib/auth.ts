// Règles partagées par les routes et écrans de connexion.

/** Longueur minimale d'un mot de passe (Supabase en exige 6 par défaut ; on demande plus). */
export const PASSWORD_MIN = 8;
/** Au-delà, bcrypt (Supabase Auth) ignore la suite : on refuse plutôt que de tronquer en silence. */
export const PASSWORD_MAX = 72;

export const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;

/** Où renvoyer après un lien d'e-mail : uniquement des chemins connus, jamais une URL fournie telle quelle. */
const NEXT_PATHS = new Set(["/", "/login/nouveau"]);
export const safeNext = (next: string | null | undefined) => (next && NEXT_PATHS.has(next) ? next : "/");
