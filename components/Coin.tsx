import { useId } from "react";

/** Pièce d'or de la cagnotte, en SVG : l'emoji 🪙 sort argentée sur certains systèmes. */
export function Coin({ className = "" }: { className?: string }) {
  const id = useId();
  return (
    <svg className={`coin ${className}`} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <radialGradient id={id} cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#fff1b8" />
          <stop offset="0.45" stopColor="#f2c14e" />
          <stop offset="1" stopColor="#b8801f" />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="11" fill={`url(#${id})`} stroke="#9a6a16" strokeWidth="1" />
      <circle cx="12" cy="12" r="7.5" fill="none" stroke="#a87418" strokeWidth="1" opacity="0.7" />
      <path d="M12 7.5 L13.2 10.8 L16.5 12 L13.2 13.2 L12 16.5 L10.8 13.2 L7.5 12 L10.8 10.8 Z" fill="#a87418" opacity="0.8" />
    </svg>
  );
}
