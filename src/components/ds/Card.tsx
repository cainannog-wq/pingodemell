"use client";

import { useState, type CSSProperties, type HTMLAttributes } from "react";

// Porta de components/core/Card.jsx.
export type CardTone = "cream" | "white" | "warm" | "brown";

const TONES: Record<CardTone, CSSProperties> = {
  cream: { background: "var(--surface-card)" },
  white: { background: "var(--surface-raised)" },
  warm: { background: "var(--surface-warm)" },
  brown: { background: "var(--pdm-brown)", color: "var(--pdm-white)" },
};

export function Card({
  interactive = false,
  tone = "cream",
  padding = "var(--space-4)",
  children,
  style,
  ...rest
}: {
  interactive?: boolean;
  tone?: CardTone;
  padding?: string | number;
  style?: CSSProperties;
} & HTMLAttributes<HTMLDivElement>) {
  const [hover, setHover] = useState(false);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        borderRadius: "var(--radius)",
        boxShadow: "var(--shadow-rest)",
        overflow: "hidden",
        padding,
        transition: "var(--transition-base)",
        boxSizing: "border-box",
        fontFamily: "var(--font-body)",
        color: "var(--text-body)",
        ...TONES[tone],
        ...(interactive && hover
          ? { boxShadow: "var(--shadow-raised)", transform: "scale(1.02)", cursor: "pointer" }
          : null),
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
