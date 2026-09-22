"use client";

import { useState, type CSSProperties, type SelectHTMLAttributes } from "react";
import { Icon } from "./Icon";

// Mesma linguagem visual do Input, com seta de dropdown.
export function Select({
  invalid,
  style,
  children,
  ...rest
}: {
  invalid?: boolean;
  style?: CSSProperties;
} & SelectHTMLAttributes<HTMLSelectElement>) {
  const [focus, setFocus] = useState(false);

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <select
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={{
          width: "100%",
          boxSizing: "border-box",
          minHeight: "var(--tap-min)",
          padding: "12px 40px 12px 14px",
          fontFamily: "var(--font-body)",
          fontSize: "var(--fs-body)",
          lineHeight: "var(--lh-body)",
          color: "var(--text-body)",
          background: "var(--surface-raised)",
          border: "1.5px solid " + (invalid ? "var(--pdm-error)" : focus ? "var(--pdm-brown)" : "var(--border-subtle)"),
          borderRadius: "var(--radius)",
          outline: focus ? "2px solid var(--focus-ring)" : "none",
          outlineOffset: "2px",
          transition: "var(--transition-base)",
          appearance: "none",
          cursor: "pointer",
          ...style,
        }}
        {...rest}
      >
        {children}
      </select>
      <span style={{ position: "absolute", right: 12, display: "flex", pointerEvents: "none" }}>
        <Icon name="expand_more" size={20} />
      </span>
    </div>
  );
}
