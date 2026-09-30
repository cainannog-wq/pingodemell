"use client";

import { useId, useRef, useState } from "react";
import { Button } from "@/components/ds";

// "Copiar mensagem" (PR confirmacao-e-gravacao): para quem não tem o
// WhatsApp instalado no aparelho, ou quando a mensagem é longa demais para
// abrir pelo link. Se a área de transferência falhar (navegador antigo,
// permissão negada), a mensagem aparece num campo de texto selecionável.
export function CopiarMensagem({
  texto,
  destaque = false,
  instrucao,
}: {
  texto: string;
  // Botão primário em vez de secundário (mensagem passou do orçamento).
  destaque?: boolean;
  instrucao?: string;
}) {
  const [estado, setEstado] = useState<"parado" | "copiado" | "manual">("parado");
  const campo = useRef<HTMLTextAreaElement>(null);
  const idCampo = useId();

  async function copiar() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("sem área de transferência");
      await navigator.clipboard.writeText(texto);
      setEstado("copiado");
    } catch {
      setEstado("manual");
      requestAnimationFrame(() => {
        campo.current?.focus();
        campo.current?.select();
      });
    }
  }

  return (
    <div className="site-copiar">
      {instrucao ? <p className="site-copiar-instrucao">{instrucao}</p> : null}
      <Button type="button" variant={destaque ? "primary" : "secondary"} size="md" iconLeft="content_copy" onClick={copiar}>
        Copiar mensagem
      </Button>
      <p className="site-copiar-status" role="status" aria-live="polite">
        {estado === "copiado" ? "Mensagem copiada. Cole na conversa do WhatsApp." : ""}
        {estado === "manual" ? "Não deu para copiar sozinho. Selecione o texto abaixo e copie." : ""}
      </p>
      {estado === "manual" ? (
        <>
          <label htmlFor={idCampo} className="site-visually-hidden">
            Mensagem do pedido
          </label>
          <textarea id={idCampo} ref={campo} className="site-copiar-campo" readOnly value={texto} rows={10} />
        </>
      ) : null}
    </div>
  );
}
