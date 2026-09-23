"use client";

import Link from "next/link";
import { useState, type CSSProperties, type ReactNode } from "react";
import { Icon } from "./Icon";

// Porta de components/core/TextLink.jsx: link marrom com ícone opcional
// depois do texto, sublinhado no hover.
export function TextLink({
  href,
  icon,
  children,
  style,
}: {
  href: string;
  icon?: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  const [hover, setHover] = useState(false);

  return (
    <Link
      href={href}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        fontFamily: "var(--font-body)",
        fontWeight: "var(--fw-semibold)" as CSSProperties["fontWeight"],
        color: hover ? "var(--text-link-hover)" : "var(--text-link)",
        textDecoration: hover ? "underline" : "none",
        textUnderlineOffset: "3px",
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-1)",
        minHeight: "var(--tap-min)",
        transition: "var(--transition-base)",
        ...style,
      }}
    >
      {children}
      {icon ? <Icon name={icon} size={18} tone="inherit" /> : null}
    </Link>
  );
}
