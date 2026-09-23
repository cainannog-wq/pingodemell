import type { CSSProperties } from "react";

// Marca oficial do WhatsApp (public/icons/whatsapp.png), decorativa: quem
// usa sempre tem o texto ("Peça pelo WhatsApp", "Fale conosco") ou um
// aria-label ao lado. Porta do .ds-mark-whatsapp do handoff.
export function WhatsAppMark({ size = 24, style }: { size?: number; style?: CSSProperties }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        flex: "none",
        width: size,
        height: size,
        background: 'url("/icons/whatsapp.png") center / contain no-repeat',
        ...style,
      }}
    />
  );
}
