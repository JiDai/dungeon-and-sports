import { ImageResponse } from "next/og";

// L'icône de l'app (écran d'accueil, notifications), dessinée à la volée : un C de braise sur fond de
// parchemin sombre. Sans marge transparente, pour que le masque arrondi d'iOS ou d'Android la recadre bien.
export function appIcon(size: number): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#2f2a25",
        }}
      >
        <div
          style={{
            width: size * 0.62,
            height: size * 0.62,
            borderRadius: "50%",
            border: `${Math.round(size * 0.1)}px solid #dba53d`,
            borderRightColor: "transparent",
            transform: "rotate(-20deg)",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: size * 0.14,
            height: size * 0.14,
            borderRadius: "50%",
            background: "#e8833a",
            display: "flex",
          }}
        />
      </div>
    ),
    { width: size, height: size },
  );
}
