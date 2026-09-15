import type { CSSProperties, ReactNode } from "react";

// Porta de components/forms/Field.jsx.
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  style,
}: {
  label?: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "var(--font-body)", ...style }}>
      {label ? (
        <label
          htmlFor={htmlFor}
          style={{ fontSize: "var(--fs-small)", fontWeight: "var(--fw-semibold)" as CSSProperties["fontWeight"], color: "var(--text-strong)" }}
        >
          {label}
          {required ? <span style={{ color: "var(--pdm-error)" }}> *</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p style={{ margin: 0, fontSize: "var(--fs-small)", lineHeight: "var(--lh-small)", color: "var(--pdm-error)" }}>
          {error}
        </p>
      ) : hint ? (
        <p style={{ margin: 0, fontSize: "var(--fs-small)", lineHeight: "var(--lh-small)", color: "var(--text-muted)" }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
