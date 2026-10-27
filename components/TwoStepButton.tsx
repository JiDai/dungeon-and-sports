"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

interface Props {
  className?: string;
  armedLabel: string;
  onConfirm: () => void;
  children: ReactNode;
}

/** Confirmation en deux clics (sans fenêtre pop-up) : 1er clic = armé, 2e clic = action. */
export function TwoStepButton({ className, armedLabel, onConfirm, children }: Props) {
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
    <button type="button" className={className} onClick={handleClick}>
      {armed ? armedLabel : children}
    </button>
  );
}
