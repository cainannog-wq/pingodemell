"use client";

import { useState, type InputHTMLAttributes } from "react";

// Switch on/off. Uso não controlado (com `name`) manda "on"/ausente no
// FormData, igual um checkbox nativo — é o modo usado dentro de formulário.
// Uso controlado (com `checked` + `onCheckedChange`) serve pra ação
// imediata fora de formulário, como o toggle inline da listagem.
export function Toggle({
  name,
  checked: checkedProp,
  defaultChecked = false,
  onCheckedChange,
  label,
  disabled,
  ...rest
}: {
  name?: string;
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
} & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "name" | "defaultChecked" | "checked" | "onChange" | "disabled"
>) {
  const isControlled = checkedProp !== undefined;
  const [internalChecked, setInternalChecked] = useState(defaultChecked);
  const checked = isControlled ? checkedProp : internalChecked;

  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 12,
        cursor: disabled ? "not-allowed" : "pointer",
        userSelect: "none",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <span
        style={{
          position: "relative",
          width: 44,
          height: 26,
          flex: "none",
          borderRadius: "var(--radius-pill)",
          // Cores trocadas na auditoria de acessibilidade de 22/09/2026:
          // --pdm-gold (ligado) e --pdm-disabled-bg (desligado) tinham só
          // ~1,4:1 e ~1,3:1 de contraste contra fundo branco, abaixo do
          // 3:1 exigido pra componente de interface (SC 1.4.11).
          // --pdm-brown (5,9:1) e --pdm-muted (4,9:1) resolvem isso.
          background: checked ? "var(--pdm-brown)" : "var(--pdm-muted)",
          transition: "var(--transition-base)",
        }}
      >
        <input
          type="checkbox"
          name={name}
          checked={checked}
          disabled={disabled}
          onChange={(e) => {
            const next = e.target.checked;
            if (!isControlled) setInternalChecked(next);
            onCheckedChange?.(next);
          }}
          style={{
            position: "absolute",
            inset: 0,
            margin: 0,
            opacity: 0,
            cursor: disabled ? "not-allowed" : "pointer",
          }}
          {...rest}
        />
        <span
          style={{
            position: "absolute",
            top: 3,
            left: checked ? 21 : 3,
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: "var(--pdm-white)",
            boxShadow: "var(--shadow-rest)",
            transition: "var(--transition-base)",
          }}
        />
      </span>
      {label ? <span style={{ fontSize: "var(--fs-body)", color: "var(--text-body)" }}>{label}</span> : null}
    </label>
  );
}
