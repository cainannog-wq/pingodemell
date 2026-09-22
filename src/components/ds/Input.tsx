"use client";

import { useState, type CSSProperties, type InputHTMLAttributes, type Ref } from "react";
import { Icon } from "./Icon";

// Porta de components/forms/Input.jsx.
export function Input({
  icon,
  invalid,
  style,
  ref,
  ...rest
}: {
  icon?: string;
  invalid?: boolean;
  style?: CSSProperties;
  ref?: Ref<HTMLInputElement>;
} & InputHTMLAttributes<HTMLInputElement>) {
  const [focus, setFocus] = useState(false);

  const control: CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    minHeight: "var(--tap-min)",
    padding: "12px 14px",
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
  };

  const field = (
    <input
      ref={ref}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      style={{
        ...control,
        paddingLeft: icon ? "44px" : "14px",
        ...style,
      }}
      {...rest}
    />
  );

  if (!icon) return field;

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <span style={{ position: "absolute", left: "14px", display: "flex", pointerEvents: "none" }}>
        <Icon name={icon} size={20} />
      </span>
      {field}
    </div>
  );
}
