"use client";

import type { ReactNode } from "react";
import { Icon } from "@/components/ds";

// Caixa recolhível de um grupo do Kit Festa por pessoa (recheio do bolo,
// bebida, doces...). Fechada, mostra só o título e o resumo da escolha
// (ou o que falta); aberta, mostra o grupo inteiro. Quem decide qual está
// aberta é o ConfigKit (uma por vez, a próxima pendente depois de cada
// escolha); clicar no título abre ou fecha à mão. O conteúdo fica no HTML
// também quando fechado (atributo hidden), então a escolha feita não se perde.
export function AcordeaoDoGrupo({
  id,
  titulo,
  resumo,
  completo,
  aberto,
  aoAlternar,
  children,
}: {
  id: string;
  titulo: string;
  resumo: string;
  completo: boolean;
  aberto: boolean;
  aoAlternar: () => void;
  children: ReactNode;
}) {
  return (
    <section className="interna-acordeao" data-completo={completo} data-aberto={aberto}>
      <button
        type="button"
        className="interna-acordeao-botao"
        aria-expanded={aberto}
        aria-controls={`${id}-corpo`}
        onClick={aoAlternar}
      >
        <span className="interna-acordeao-texto">
          <span className="interna-bloco-titulo">{titulo}</span>
          <span className="interna-acordeao-resumo">{resumo}</span>
        </span>
        {completo ? <Icon name="check_circle" size={22} tone="inherit" className="interna-acordeao-ok" /> : null}
        <Icon name="expand_more" size={24} tone="inherit" className="interna-acordeao-seta" />
      </button>
      <div id={`${id}-corpo`} className="interna-acordeao-corpo" hidden={!aberto}>
        {children}
      </div>
    </section>
  );
}
