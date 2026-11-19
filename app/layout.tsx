import type { Metadata, Viewport } from "next";
import { Caveat, Playfair_Display, Quicksand } from "next/font/google";
// oxlint-disable-next-line import/no-unassigned-import
import "./globals.css";

const playfair = Playfair_Display({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-playfair" });
const quicksand = Quicksand({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-quicksand" });
const caveat = Caveat({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-caveat" });

export const metadata: Metadata = {
  title: "Carnet de Cendres",
  description: "Un carnet de quêtes sportives façon jeu de rôle.",
  // Installée sur l'écran d'accueil d'iOS, l'app s'ouvre en plein écran, sans la barre de Safari.
  appleWebApp: { capable: true, title: "Carnet", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fdf8f0" },
    { media: "(prefers-color-scheme: dark)", color: "#25211d" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${playfair.variable} ${quicksand.variable} ${caveat.variable}`}>
      <body>{children}</body>
    </html>
  );
}
