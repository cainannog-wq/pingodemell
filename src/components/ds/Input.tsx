"use client";

import { useState, type CSSProperties, type InputHTMLAttributes, type Ref } from "react";
import { Icon } from "./Icon";

// Porta de components/forms/Input.jsx.
export function Input({
  icon,
  invalid,
  onClear,
  style,
  ref,
  ...rest
}: {
  icon?: string;
  invalid?: boolean;
  // Botão "x" dentro do campo, só aparece quando há valor. Opcional — quem
  // não passar continua com o Input igual antes.
  onClear?: () => void;
  style?: CSSProperties;
  ref?: Ref<HTMLInputElement>;
} & InputHTMLAttributes<HTMLInputElement>) {
  const [focus, setFocus] = useState(false);
  const showClear = Boolean(onClear) && Boolean(rest.value);

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
        paddingRight: showClear ? "44px" : undefined,
        ...style,
      }}
      {...rest}
    />
  );

  if (!icon && !showClear) return field;

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
      {icon ? (
        <span style={{ position: "absolute", left: "14px", display: "flex", pointerEvents: "none" }}>
          <Icon name={icon} size={20} />
        </span>
      ) : null}
      {field}
      {showClear ? (
        <button
          type="button"
          onClick={onClear}
          aria-label="Limpar busca"
          style={{
            position: "absolute",
            right: "8px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 32,
            height: 32,
            border: "none",
            background: "transparent",
            cursor: "pointer",
            borderRadius: "var(--radius)",
          }}
        >
          <Icon name="close" size={18} />
        </button>
      ) : null}
    </div>
  );
}
