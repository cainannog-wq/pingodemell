import type { CSSProperties, HTMLAttributes } from "react";
import { Icon } from "./Icon";

// Porta de components/core/Badge.jsx.
export type BadgeVariant =
  | "accent"
  | "gold"
  | "brown"
  | "outline"
  | "success"
  | "error"
  | "warning"
  | "info";

const VARIANTS: Record<BadgeVariant, CSSProperties> = {
  accent: { background: "var(--pdm-gold-soft)", color: "var(--pdm-black)" },
  gold: { background: "var(--pdm-gold)", color: "var(--pdm-black)" },
  brown: { background: "var(--pdm-brown)", color: "var(--pdm-white)" },
  outline: {
    background: "transparent",
    color: "var(--pdm-brown)",
    boxShadow: "inset 0 0 0 1.5px var(--pdm-brown)",
  },
  success: { background: "var(--pdm-success)", color: "var(--pdm-white)" },
  error: { background: "var(--pdm-error)", color: "var(--pdm-white)" },
  warning: { background: "var(--pdm-warning)", color: "var(--pdm-black)" },
  info: { background: "var(--pdm-info)", color: "var(--pdm-white)" },
};

export function Badge({
  variant = "accent",
  shape = "pill",
  icon,
  children,
  style,
  ...rest
}: {
  variant?: BadgeVariant;
  shape?: "pill" | "round";
  icon?: string;
  style?: CSSProperties;
} & HTMLAttributes<HTMLSpanElement>) {
  const round = shape === "round";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "6px",
        fontFamily: "var(--font-body)",
        fontWeight: "var(--fw-bold)" as CSSProperties["fontWeight"],
        fontSize: "var(--fs-small)",
        lineHeight: 1,
        letterSpacing: "var(--tracking-label)",
        textTransform: "uppercase",
        padding: round ? 0 : "7px 14px",
        width: round ? 56 : undefined,
        height: round ? 56 : undefined,
        borderRadius: round ? "var(--radius-round)" : "var(--radius-pill)",
        textAlign: "center",
        ...VARIANTS[variant],
        ...style,
      }}
      {...rest}
    >
      {icon ? <Icon name={icon} size={16} tone="inherit" /> : null}
      {children}
    </span>
  );
}
