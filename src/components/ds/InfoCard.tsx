import type { CSSProperties, ReactNode } from "react";
import { Icon } from "./Icon";

// Porta de components/content/InfoCard.jsx: ícone + título em script +
// texto. `align="start"` é a versão compacta (alinhada à esquerda), usada
// no mobile.
export function InfoCard({
  icon,
  title,
  children,
  align = "center",
  compact = false,
  style,
}: {
  icon?: string;
  title: string;
  children: ReactNode;
  align?: "center" | "start";
  compact?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        background: "var(--surface-card)",
        borderRadius: "var(--radius)",
        boxShadow: "var(--shadow-rest)",
        padding: compact ? "20px" : "var(--space-5)",
        display: "flex",
        flexDirection: "column",
        gap: compact ? "10px" : "var(--space-3)",
        alignItems: align === "center" ? "center" : "flex-start",
        textAlign: align,
        boxSizing: "border-box",
        ...style,
      }}
    >
      {icon ? <Icon name={icon} size={40} color="var(--gold-400)" /> : null}
      <h3
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: "var(--fw-regular)" as CSSProperties["fontWeight"],
          fontSize: "30px",
          lineHeight: 1.2,
          color: "var(--text-strong)",
          margin: 0,
        }}
      >
        {title}
      </h3>
      <div
        style={{
          fontFamily: "var(--font-body)",
          fontSize: "var(--fs-body)",
          lineHeight: "var(--lh-body)",
          color: "var(--text-body)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
