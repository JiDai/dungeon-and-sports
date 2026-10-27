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
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${playfair.variable} ${quicksand.variable} ${caveat.variable}`}>
      <body>{children}</body>
    </html>
  );
}
