"use client";

import dynamic from "next/dynamic";

// Le carnet vit dans le localStorage : on le rend uniquement côté navigateur.
export const CarnetClient = dynamic(() => import("./Carnet").then((m) => m.Carnet), {
  ssr: false,
  loading: () => (
    <div className="panel">
      <p className="empty-log">Le carnet s&apos;ouvre...</p>
    </div>
  ),
});
