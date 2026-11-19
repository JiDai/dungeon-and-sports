import type { MetadataRoute } from "next";

// Le manifeste de l'app web : c'est lui qui permet à iOS de l'installer sur l'écran d'accueil (Partager →
// « Sur l'écran d'accueil »), seule façon d'y recevoir des notifications sans appli native.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Carnet de Cendres",
    short_name: "Carnet",
    description: "Un carnet de quêtes sportives façon jeu de rôle.",
    lang: "fr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fdf8f0",
    theme_color: "#fdf8f0",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
