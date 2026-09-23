"use client";

import { useState } from "react";
import { WhatsAppMark } from "./WhatsAppMark";

// Porta de components/core/WhatsAppFab.jsx (versão recolhida, 64×64):
// botão flutuante fixo no canto inferior direito, presente em todas as
// páginas do site público. Abre a conversa numa aba nova.
export function WhatsAppFab({ href, label }: { href: string; label: string }) {
  const [hover, setHover] = useState(false);

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${label} pelo WhatsApp (abre em nova aba)`}
      title={label}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "fixed",
        right: "var(--space-4)",
        bottom: "var(--space-4)",
        zIndex: 60,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 64,
        height: 64,
        borderRadius: "var(--radius-pill)",
        background: hover ? "var(--whatsapp-600)" : "var(--whatsapp-500)",
        boxShadow: hover ? "var(--shadow-raised)" : "var(--shadow-rest)",
        transform: hover ? "var(--hover-lift)" : "none",
        transition: "var(--transition-base)",
      }}
    >
      <WhatsAppMark size={64} />
    </a>
  );
}
