"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ds";

// Avisos rápidos empilhados ("Item removido" + "Desfazer"), no canto de baixo
// da tela. Cada aviso é independente: tem o próprio botão de ação, o próprio
// tempo e some sozinho depois de DURACAO_AVISO_MS.
//
// - O tempo pausa com o mouse em cima e com o foco dentro do aviso (quem
//   navega por teclado tem o tempo todo para chegar no botão).
// - Some também com o X, com qualquer clique fora dos avisos, ao rolar a
//   página (roda do mouse, dedo ou teclas de rolagem) e ao sair da página
//   (o componente desmonta). Só o botão de ação desfaz alguma coisa; todo o
//   resto apenas fecha, e o que o aviso anunciava fica valendo. Quem abriu
//   o aviso decide o que "fechar" significa (aoFechar).
// - Um clique em algo marcado com data-nao-fecha-avisos (o botão de remover
//   da linha) não fecha os avisos que já estão na tela: cada remoção tem o
//   seu, e o "Desfazer" de uma não depende das outras.
// - O contêiner é uma região aria-live="polite": leitor de tela anuncia o
//   aviso novo sem interromper o que estiver lendo. Ele fica sempre no HTML,
//   mesmo vazio, porque o leitor só anuncia o que entra em uma região que já
//   existia.
// - Movimento: a entrada usa var(--duration), que o CSS do site zera com
//   prefers-reduced-motion. Não há animação de saída.

export const DURACAO_AVISO_MS = 8000;

export type Aviso = {
  id: string;
  texto: string;
  // `descricao` é o nome completo da ação para leitor de tela (com vários
  // avisos na tela, "Desfazer" sozinho não diz qual item volta).
  acao?: { rotulo: string; descricao?: string; aoClicar: () => void };
};

// Teclas que rolam a página. A barra de espaço só conta com o foco no corpo
// da página (num botão ela aperta o botão).
const TECLAS_DE_ROLAGEM = new Set(["PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown"]);

function alvoEditavel(alvo: EventTarget | null): boolean {
  return alvo instanceof HTMLElement && alvo.closest("input, textarea, select, [contenteditable='true']") !== null;
}

export function PilhaDeAvisos({ avisos, aoFechar }: { avisos: Aviso[]; aoFechar: (id: string) => void }) {
  // Sempre a lista e o callback mais novos, sem reprogramar os ouvintes a
  // cada renderização.
  const ultimos = useRef({ avisos, aoFechar });
  useEffect(() => {
    ultimos.current = { avisos, aoFechar };
  });

  const temAvisos = avisos.length > 0;
  useEffect(() => {
    if (!temAvisos) return;
    const fecharTodos = () => {
      const { avisos: atuais, aoFechar: fechar } = ultimos.current;
      for (const a of atuais) fechar(a.id);
    };
    const aoClicar = (e: MouseEvent) => {
      const alvo = e.target;
      if (alvo instanceof Element && alvo.closest("[data-aviso], [data-nao-fecha-avisos]")) return;
      fecharTodos();
    };
    const aoTecla = (e: KeyboardEvent) => {
      if (alvoEditavel(e.target)) return;
      const rola = TECLAS_DE_ROLAGEM.has(e.key) || (e.key === " " && e.target === document.body);
      if (rola) fecharTodos();
    };
    // Capture: pega o clique antes de qualquer handler que pare a propagação.
    document.addEventListener("click", aoClicar, true);
    window.addEventListener("wheel", fecharTodos, { passive: true });
    window.addEventListener("touchmove", fecharTodos, { passive: true });
    window.addEventListener("keydown", aoTecla);
    return () => {
      document.removeEventListener("click", aoClicar, true);
      window.removeEventListener("wheel", fecharTodos);
      window.removeEventListener("touchmove", fecharTodos);
      window.removeEventListener("keydown", aoTecla);
    };
  }, [temAvisos]);

  return (
    <div className="avisos" aria-live="polite" aria-relevant="additions text">
      {avisos.map((aviso) => (
        <AvisoItem key={aviso.id} aviso={aviso} aoFechar={() => aoFechar(aviso.id)} />
      ))}
    </div>
  );
}

function AvisoItem({ aviso, aoFechar }: { aviso: Aviso; aoFechar: () => void }) {
  const [pausado, setPausado] = useState(false);
  const restante = useRef(DURACAO_AVISO_MS);
  const fechar = useRef(aoFechar);
  useEffect(() => {
    fechar.current = aoFechar;
  });

  // Conta o tempo que falta; ao pausar guarda quanto sobrou, ao voltar
  // recomeça dali.
  useEffect(() => {
    if (pausado) return;
    const inicio = Date.now();
    const timer = setTimeout(() => fechar.current(), restante.current);
    return () => {
      clearTimeout(timer);
      restante.current = Math.max(0, restante.current - (Date.now() - inicio));
    };
  }, [pausado]);

  return (
    <div
      className="aviso"
      data-aviso
      onPointerEnter={() => setPausado(true)}
      onPointerLeave={() => setPausado(false)}
      onFocus={() => setPausado(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setPausado(false);
      }}
    >
      <span className="aviso-texto">{aviso.texto}</span>
      {aviso.acao ? (
        <button type="button" className="aviso-acao" aria-label={aviso.acao.descricao} onClick={aviso.acao.aoClicar}>
          {aviso.acao.rotulo}
        </button>
      ) : null}
      <button type="button" className="aviso-fechar" aria-label="Fechar aviso" onClick={aoFechar}>
        <Icon name="close" size={20} tone="inherit" />
      </button>
    </div>
  );
}
