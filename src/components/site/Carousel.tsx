"use client";

import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/ds";

// Carrossel horizontal de "Os mais pedidos".
// Desktop: 4 cards visíveis e setas (anterior desabilitada no começo,
// próxima desabilitada no fim). Mobile: rolagem com o dedo, encaixe por
// card e pontos indicando a posição.
// Teclado: as setas são botões; a faixa também é focável e rola com as
// setas do teclado (comportamento nativo de área rolável).
// Com prefers-reduced-motion, a rolagem pelas setas é instantânea.
export function Carousel({
  rotulo,
  cabecalho,
  children,
}: {
  rotulo: string;
  cabecalho: ReactNode;
  children: ReactNode;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const slides = Children.toArray(children);
  const [inicio, setInicio] = useState(true);
  const [fim, setFim] = useState(false);
  const [ativo, setAtivo] = useState(0);

  const atualizar = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const max = track.scrollWidth - track.clientWidth;
    setInicio(track.scrollLeft <= 2);
    setFim(track.scrollLeft >= max - 2);
    const primeiro = track.firstElementChild as HTMLElement | null;
    if (primeiro) {
      const passo = primeiro.offsetWidth + parseFloat(getComputedStyle(track).columnGap || "0");
      const indice = track.scrollLeft >= max - 2 ? slides.length - 1 : Math.round(track.scrollLeft / passo);
      setAtivo(Math.min(slides.length - 1, Math.max(0, indice)));
    }
  }, [slides.length]);

  useEffect(() => {
    atualizar();
    const track = trackRef.current;
    if (!track) return;
    track.addEventListener("scroll", atualizar, { passive: true });
    window.addEventListener("resize", atualizar);
    return () => {
      track.removeEventListener("scroll", atualizar);
      window.removeEventListener("resize", atualizar);
    };
  }, [atualizar]);

  const rolar = (direcao: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    const reduzir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    track.scrollBy({ left: direcao * track.clientWidth, behavior: reduzir ? "auto" : "smooth" });
  };

  return (
    <>
      <div className="site-section-head">
        {cabecalho}
        <div className="site-carousel-arrows">
          <button type="button" className="site-carousel-arrow" aria-label="Produtos anteriores" disabled={inicio} onClick={() => rolar(-1)}>
            <Icon name="arrow_back" size={22} tone="inherit" />
          </button>
          <button type="button" className="site-carousel-arrow" aria-label="Próximos produtos" disabled={fim} onClick={() => rolar(1)}>
            <Icon name="arrow_forward" size={22} tone="inherit" />
          </button>
        </div>
      </div>

      <div ref={trackRef} className="site-carousel-track" role="region" aria-label={rotulo} tabIndex={0}>
        {slides.map((slide, i) => (
          <div key={i} className="site-carousel-slide">
            {slide}
          </div>
        ))}
      </div>

      {slides.length > 1 ? (
        <div className="site-carousel-dots" aria-hidden="true">
          {slides.map((_, i) => (
            <span key={i} className="site-carousel-dot" data-ativo={i === ativo} />
          ))}
        </div>
      ) : null}
    </>
  );
}
