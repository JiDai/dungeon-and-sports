import { appIcon } from "@/lib/icon";

// L'icône de l'écran d'accueil iOS (apple-touch-icon) : Safari ne lit pas celles du manifeste.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return appIcon(180);
}
