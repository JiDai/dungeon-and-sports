"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, type ButtonVariant } from "./Button";

interface Props {
  variant?: ButtonVariant;
  className?: string;
  armedLabel: string;
  onConfirm: () => void;
  children: ReactNode;
}

/** Confirmation en deux clics (sans fenêtre pop-up) : 1er clic = armé, 2e clic = action. */
export function TwoStepButton({ variant, className, armedLabel, onConfirm, children }: Props) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const handleClick = () => {
    window.clearTimeout(timer.current);
    if (armed) {
      setArmed(false);
      onConfirm();
      return;
    }
    setArmed(true);
    timer.current = window.setTimeout(() => setArmed(false), 4000);
  };

  return (
    <Button variant={variant} className={className} onClick={handleClick}>
      {armed ? armedLabel : children}
    </Button>
  );
}
