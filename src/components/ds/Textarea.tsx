"use client";

import { useState, type CSSProperties, type TextareaHTMLAttributes } from "react";

// Porta de components/forms/Textarea.jsx.
export function Textarea({
  invalid,
  rows = 4,
  style,
  ...rest
}: {
  invalid?: boolean;
  style?: CSSProperties;
} & TextareaHTMLAttributes<HTMLTextAreaElement>) {
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

  return (
    <textarea
      rows={rows}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      style={{ ...control, resize: "vertical", ...style }}
      {...rest}
    />
  );
}
