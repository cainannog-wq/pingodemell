"use client";

import { useState, type InputHTMLAttributes } from "react";

// Switch on/off que manda "on"/ausente no FormData, igual um checkbox nativo.
export function Toggle({
  name,
  defaultChecked = false,
  label,
  ...rest
}: {
  name: string;
  defaultChecked?: boolean;
  label?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "name" | "defaultChecked" | "checked" | "onChange">) {
  const [checked, setChecked] = useState(defaultChecked);

  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 12, cursor: "pointer", userSelect: "none" }}>
      <span
        style={{
          position: "relative",
          width: 44,
          height: 26,
          flex: "none",
          borderRadius: "var(--radius-pill)",
          background: checked ? "var(--pdm-gold)" : "var(--pdm-disabled-bg)",
          transition: "var(--transition-base)",
        }}
      >
        <input
          type="checkbox"
          name={name}
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          style={{ position: "absolute", inset: 0, margin: 0, opacity: 0, cursor: "pointer" }}
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
