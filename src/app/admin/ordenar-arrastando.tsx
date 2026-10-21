"use client";

/* eslint-disable react-hooks/refs -- useOrdenarArrastando guarda uma ref do contêiner, lida só em eventos e efeitos (nunca na renderização); a regra enxerga o objeto devolvido como se o lesse ao renderizar. */

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

// Reordenar arrastando (admin): uma alça de seis pontos em cada item; a pessoa
// clica, segura e arrasta o item até a posição desejada, e solta. No toque
// funciona do mesmo jeito (Pointer Events). Sem setas visíveis, mas a alça
// também é focável: com o foco nela, as setas do teclado movem o item uma
// posição e Home e End levam ao começo e ao fim (acessibilidade). Cada
// mudança de ordem é anunciada ao leitor de tela.
//
// A lista de quem usa guarda a ordem; este arquivo só decide a nova ordem e a
// devolve (aoOrdenar recebe os ids na ordem nova). Nada aqui grava.

// Tira o item `id` e o põe na posição `destino` (índice na lista de antes).
export function moverPara(ids: readonly string[], id: string, destino: number): string[] {
  const de = ids.indexOf(id);
  if (de < 0 || destino < 0 || destino >= ids.length || de === destino) return [...ids];
  const saida = ids.filter((x) => x !== id);
  saida.splice(destino, 0, id);
  return saida;
}

const OCULTO: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
};

export type AoOrdenar = (novaOrdem: string[], idMovido: string, destino: number) => void;

export function useOrdenarArrastando(ids: readonly string[], aoOrdenar: AoOrdenar, nomeDe: (id: string) => string) {
  const raiz = useRef<HTMLElement | null>(null);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [anuncio, setAnuncio] = useState("");
  const focoPendente = useRef<string | null>(null);

  // Depois de a ordem mudar pelo teclado, a alça volta a ter o foco (mover o
  // elemento no DOM pode tirá-lo).
  useEffect(() => {
    const id = focoPendente.current;
    if (!id || !raiz.current) return;
    focoPendente.current = null;
    Array.from(raiz.current.querySelectorAll<HTMLElement>("[data-alca-id]")).find((el) => el.dataset.alcaId === id)?.focus();
  }, [ids]);

  // Ref de callback do contêiner da lista (quem usa o hook diretamente, sem ListaOrdenavel).
  function registrarRaiz(el: HTMLElement | null) {
    raiz.current = el;
  }

  function alvoSob(x: number, y: number): string | null {
    const itens = Array.from(raiz.current?.querySelectorAll<HTMLElement>("[data-ordenar-id]") ?? []);
    let melhor: { id: string; d: number } | null = null;
    for (const el of itens) {
      const r = el.getBoundingClientRect();
      const dentro = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
      const d = dentro ? 0 : Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
      if (!melhor || d < melhor.d) melhor = { id: el.dataset.ordenarId as string, d };
    }
    return melhor?.id ?? null;
  }

  function aplicar(id: string, destino: number) {
    const nova = moverPara(ids, id, destino);
    if (nova.join() === ids.join()) return;
    setAnuncio(`${nomeDe(id)} movido para a posição ${destino + 1} de ${ids.length}.`);
    aoOrdenar(nova, id, destino);
  }

  function limpar() {
    setArrastando(null);
    setSobre(null);
  }

  return {
    registrarRaiz,
    arrastando,
    // Aviso para leitor de tela: renderize <AnuncioDeOrdem texto={anuncio} /> uma vez.
    anuncio,
    propsDoItem(id: string) {
      return {
        "data-ordenar-id": id,
        "data-arrastando": arrastando === id ? "true" : undefined,
        "data-sobre": arrastando !== null && sobre === id && arrastando !== id ? "true" : undefined,
      } as const;
    },
    propsDaAlca(id: string) {
      return {
        "data-alca-id": id,
        onPointerDown(e: PointerEvent<HTMLElement>) {
          if (e.button !== undefined && e.button !== 0) return;
          e.preventDefault();
          e.currentTarget.setPointerCapture?.(e.pointerId);
          setArrastando(id);
          setSobre(id);
        },
        onPointerMove(e: PointerEvent<HTMLElement>) {
          if (arrastando !== id) return;
          setSobre(alvoSob(e.clientX, e.clientY));
        },
        onPointerUp(e: PointerEvent<HTMLElement>) {
          if (arrastando !== id) return;
          const alvo = alvoSob(e.clientX, e.clientY) ?? sobre;
          limpar();
          if (alvo && alvo !== id) aplicar(id, ids.indexOf(alvo));
        },
        onPointerCancel: limpar,
        onKeyDown(e: KeyboardEvent<HTMLElement>) {
          const i = ids.indexOf(id);
          const destino = e.key === "ArrowUp" ? i - 1 : e.key === "ArrowDown" ? i + 1 : e.key === "Home" ? 0 : e.key === "End" ? ids.length - 1 : null;
          if (e.key === "Escape" && arrastando !== null) {
            limpar();
            return;
          }
          if (destino === null) return;
          e.preventDefault();
          if (destino < 0 || destino >= ids.length || destino === i) return;
          focoPendente.current = id;
          aplicar(id, destino);
        },
      };
    },
  };
}

// Seis pontos (duas colunas de três), o desenho de "arraste aqui".
export function AlcaDeOrdem({ nome, desligada = false, ...props }: { nome: string; desligada?: boolean } & Record<string, unknown>) {
  return (
    <button
      type="button"
      className="admin-alca-ordem"
      aria-label={`Reordenar ${nome}. Arraste, ou use as setas do teclado.`}
      title="Arraste para reordenar"
      disabled={desligada}
      {...props}
    >
      <svg width="14" height="20" viewBox="0 0 14 20" aria-hidden="true" focusable="false">
        {[3, 10, 17].flatMap((y) => [3, 11].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.8" fill="currentColor" />))}
      </svg>
    </button>
  );
}

export function AnuncioDeOrdem({ texto }: { texto: string }) {
  return (
    <p role="status" aria-live="polite" style={OCULTO}>
      {texto}
    </p>
  );
}

// Contêiner de uma lista ordenável: guarda a referência que a alça usa para achar
// os itens (data-ordenar-id) e o aviso para leitor de tela. `children` recebe o
// controle (propsDoItem e propsDaAlca de cada linha).
export function ListaOrdenavel({
  ids,
  aoOrdenar,
  nomeDe,
  className,
  style,
  children,
}: {
  ids: readonly string[];
  aoOrdenar: AoOrdenar;
  nomeDe: (id: string) => string;
  className?: string;
  style?: CSSProperties;
  children: (ordem: ReturnType<typeof useOrdenarArrastando>) => ReactNode;
}) {
  const ordem = useOrdenarArrastando(ids, aoOrdenar, nomeDe);
  return (
    <>
      <div ref={ordem.registrarRaiz} className={className} style={style}>
        {children(ordem)}
      </div>
      <AnuncioDeOrdem texto={ordem.anuncio} />
    </>
  );
}
