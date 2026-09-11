import type { CSSProperties, HTMLAttributes } from "react";

// Material Symbols Rounded, estilo preenchido (FILL 1) — biblioteca oficial
// da marca (ver _ds/.../readme.md). Porta de components/core/Icon.jsx.
export type IconTone = "default" | "accent" | "onDark" | "ink" | "inherit";

const TONES: Record<IconTone, string> = {
  default: "var(--icon-default)",
  accent: "var(--icon-accent)",
  onDark: "var(--text-on-dark)",
  ink: "var(--text-body)",
  inherit: "currentColor",
};

export function Icon({
  name,
  size = 24,
  color,
  tone = "default",
  style,
  className,
  ...rest
}: {
  name: string;
  size?: number;
  color?: string;
  tone?: IconTone;
  style?: CSSProperties;
  className?: string;
} & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={["material-symbols-rounded", className].filter(Boolean).join(" ")}
      aria-hidden="true"
      style={{
        fontFamily: '"Material Symbols Rounded"',
        fontWeight: 400,
        fontStyle: "normal",
        fontSize: size + "px",
        lineHeight: 1,
        letterSpacing: "normal",
        textTransform: "none",
        display: "inline-block",
        whiteSpace: "nowrap",
        wordWrap: "normal",
        direction: "ltr",
        fontVariationSettings: `'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' ${size}`,
        color: color || TONES[tone] || TONES.default,
        flexShrink: 0,
        ...style,
      }}
      {...rest}
    >
      {name}
    </span>
  );
}
