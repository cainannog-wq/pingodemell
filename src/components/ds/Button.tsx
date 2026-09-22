"use client";

import { useState, type CSSProperties, type ElementType, type ButtonHTMLAttributes } from "react";
import { Icon } from "./Icon";

// Porta de components/core/Button.jsx.
export type ButtonVariant = "primary" | "secondary" | "ghost" | "whatsapp";
export type ButtonSize = "sm" | "md" | "lg";

const SIZES: Record<ButtonSize, CSSProperties> = {
  sm: { padding: "10px 16px", fontSize: "15px", minHeight: "40px" },
  md: { padding: "14px 24px", fontSize: "var(--fs-button)", minHeight: "var(--tap-min)" },
  lg: { padding: "18px 32px", fontSize: "18px", minHeight: "56px" },
};

const VARIANTS: Record<string, CSSProperties> = {
  primary: { background: "var(--pdm-gold)", color: "var(--pdm-black)", borderColor: "transparent" },
  primaryHover: { background: "var(--pdm-gold-soft)" },
  secondary: { background: "transparent", color: "var(--pdm-brown)", borderColor: "var(--pdm-brown)" },
  secondaryHover: { background: "var(--pdm-brown)", color: "var(--pdm-white)" },
  ghost: { background: "transparent", color: "var(--pdm-brown)", borderColor: "transparent" },
  ghostHover: { background: "rgba(139,89,42,.08)" },
  whatsapp: { background: "var(--pdm-whatsapp)", color: "var(--pdm-white)", borderColor: "transparent" },
  whatsappHover: { background: "#1da851" },
};

const DISABLED_STYLE: CSSProperties = {
  background: "var(--pdm-disabled-bg)",
  color: "var(--pdm-disabled-fg)",
  borderColor: "transparent",
  boxShadow: "none",
};

export function Button({
  variant = "primary",
  size = "md",
  iconLeft,
  iconRight,
  fullWidth,
  disabled,
  as = "button",
  children,
  style,
  ...rest
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconLeft?: string;
  iconRight?: string;
  fullWidth?: boolean;
  as?: ElementType;
  style?: CSSProperties;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const [hover, setHover] = useState(false);
  const [active, setActive] = useState(false);

  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "var(--space-2)",
    fontFamily: "var(--font-body)",
    fontWeight: "var(--fw-semibold)" as CSSProperties["fontWeight"],
    lineHeight: "var(--lh-button)",
    borderRadius: "var(--radius)",
    borderWidth: "2px",
    borderStyle: "solid",
    borderColor: "transparent",
    cursor: disabled ? "not-allowed" : "pointer",
    textDecoration: "none",
    width: fullWidth ? "100%" : undefined,
    boxSizing: "border-box",
    transition: "var(--transition-base)",
    ...SIZES[size],
  };

  const El = as as ElementType;

  return (
    <El
      disabled={as === "button" ? disabled : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false);
        setActive(false);
      }}
      onMouseDown={() => setActive(true)}
      onMouseUp={() => setActive(false)}
      style={{
        ...base,
        ...VARIANTS[variant],
        ...(hover && !disabled ? VARIANTS[variant + "Hover"] : null),
        ...(hover && !disabled ? { boxShadow: "var(--shadow-rest)", transform: "scale(1.02)" } : null),
        ...(active && !disabled ? { transform: "scale(.98)", boxShadow: "none" } : null),
        ...(disabled ? DISABLED_STYLE : null),
        ...style,
      }}
      {...rest}
    >
      {iconLeft ? <Icon name={iconLeft} size={20} tone="inherit" /> : null}
      {children}
      {iconRight ? <Icon name={iconRight} size={20} tone="inherit" /> : null}
    </El>
  );
}
