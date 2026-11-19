import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Le service worker doit toujours être relu : une version en cache garderait d'anciennes règles de notification.
  headers: async () => [
    {
      source: "/sw.js",
      headers: [
        { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        { key: "Content-Type", value: "application/javascript; charset=utf-8" },
      ],
    },
  ],
};

export default nextConfig;
