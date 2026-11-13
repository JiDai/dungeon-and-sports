import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "outline" | "link";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary : rose (action principale) · secondary : sauge · outline : contour sauge · link : simple lien texte. */
  variant?: ButtonVariant;
  /** Centre le bouton seul sur sa ligne. */
  center?: boolean;
}

/** Le bouton unique du carnet : même hauteur (40px) et même padding partout. */
export function Button({ variant = "primary", center = false, className, type = "button", ...rest }: ButtonProps) {
  const classes = ["btn", `btn-${variant}`, center && "btn-center", className].filter(Boolean).join(" ");
  // oxlint-disable-next-line react/button-has-type -- le type est une prop, "button" par défaut
  return <button type={type} className={classes} {...rest} />;
}
