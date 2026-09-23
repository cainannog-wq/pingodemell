"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type CSSProperties, type ReactNode } from "react";

// Porta de components/content/ProductCard.jsx, na composição usada na Home
// ("Os mais pedidos"): foto 4:3, nome, descrição curta e um rodapé livre
// (preço + ação). A foto e o nome são um link pra interna do produto; o
// clique em qualquer outro ponto do card leva ao mesmo lugar (atalho de
// mouse — quem navega por teclado usa os links, que são focáveis).
export function ProductCard({
  href,
  media,
  title,
  titleId,
  description,
  children,
  compact = false,
  style,
}: {
  href: string;
  media: ReactNode;
  title: string;
  titleId?: string;
  description?: string | null;
  children?: ReactNode;
  compact?: boolean;
  style?: CSSProperties;
}) {
  const router = useRouter();
  const [hover, setHover] = useState(false);

  return (
    <article
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a, button")) return;
        router.push(href);
      }}
      style={{
        background: "var(--surface-card)",
        borderRadius: "var(--radius)",
        overflow: "hidden",
        boxShadow: hover ? "var(--shadow-raised)" : "var(--shadow-rest)",
        transform: hover ? "var(--hover-lift)" : "none",
        transition: "var(--transition-base)",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        boxSizing: "border-box",
        ...style,
      }}
    >
      <Link href={href} style={{ display: "flex", flexDirection: "column", color: "inherit", textDecoration: "none", flex: 1 }}>
        <div style={{ position: "relative", aspectRatio: "4 / 3", background: "var(--cream-200)", overflow: "hidden" }}>
          {media}
        </div>
        <div
          style={{
            padding: compact ? "16px 16px 8px" : "24px 24px 8px",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-2)",
            flex: 1,
          }}
        >
          <h3
            id={titleId}
            style={{
              fontFamily: "var(--font-heading)",
              fontWeight: "var(--fw-bold)" as CSSProperties["fontWeight"],
              fontSize: "20px",
              lineHeight: "var(--lh-h3)",
              color: "var(--text-heading)",
              margin: 0,
            }}
          >
            {title}
          </h3>
          {description ? (
            <p
              style={{
                margin: 0,
                fontFamily: "var(--font-body)",
                fontSize: "var(--fs-small)",
                lineHeight: "var(--lh-small)",
                color: "var(--text-muted)",
              }}
            >
              {description}
            </p>
          ) : null}
        </div>
      </Link>
      {children ? (
        <div
          style={{
            padding: compact ? "0 16px 16px" : "0 24px 24px",
            display: "flex",
            flexDirection: "column",
            gap: compact ? "8px" : "10px",
          }}
        >
          {children}
        </div>
      ) : null}
    </article>
  );
}
