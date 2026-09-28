"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { Hive } from "@/components/site/Hive";
import type { FotoProduto } from "@/lib/vitrine/fotos";

// Galeria da interna: capa primeiro, depois as fotos extras na ordem do
// cadastro (buscarFotosProduto). Uma faixa só com todas as fotos:
// - desktop: a faixa mostra uma foto por vez e as miniaturas embaixo
//   escolhem qual (botões, com a atual marcada);
// - celular: a faixa rola com o dedo, com encaixe por foto e pontos
//   indicando a posição (como no layout).
// Sem foto nenhuma: o fundo da marca, como nos cards.
export function Galeria({ fotos, nome }: { fotos: FotoProduto[]; nome: string }) {
  const faixaRef = useRef<HTMLDivElement>(null);
  const [ativa, setAtiva] = useState(0);

  const atualizar = useCallback(() => {
    const faixa = faixaRef.current;
    if (!faixa || faixa.clientWidth === 0) return;
    setAtiva(Math.min(fotos.length - 1, Math.max(0, Math.round(faixa.scrollLeft / faixa.clientWidth))));
  }, [fotos.length]);

  useEffect(() => {
    const faixa = faixaRef.current;
    if (!faixa) return;
    faixa.addEventListener("scroll", atualizar, { passive: true });
    return () => faixa.removeEventListener("scroll", atualizar);
  }, [atualizar]);

  function mostrar(indice: number) {
    setAtiva(indice);
    const faixa = faixaRef.current;
    if (!faixa) return;
    const reduzir = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    faixa.scrollTo({ left: indice * faixa.clientWidth, behavior: reduzir ? "auto" : "smooth" });
  }

  if (fotos.length === 0) {
    return (
      <div className="interna-galeria">
        <div className="interna-galeria-principal">
          <div className="home-product-fallback" role="img" aria-label={`${nome}: foto ainda não disponível`}>
            <Hive />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="interna-galeria">
      <div
        ref={faixaRef}
        className="interna-galeria-principal interna-galeria-faixa"
        role="region"
        aria-label={`Fotos de ${nome}`}
        aria-roledescription="carrossel"
        tabIndex={fotos.length > 1 ? 0 : undefined}
      >
        {fotos.map((foto, i) => (
          <div key={foto.url} className="interna-galeria-foto" aria-hidden={i !== ativa || undefined}>
            <Image
              src={foto.url}
              alt={foto.alt}
              fill
              sizes="(max-width: 767px) 100vw, 572px"
              priority={i === 0}
              style={{ objectFit: "cover" }}
            />
          </div>
        ))}
      </div>

      {fotos.length > 1 ? (
        <>
          <ul className="interna-galeria-miniaturas" aria-label="Escolher foto">
            {fotos.map((foto, i) => (
              <li key={foto.url}>
                <button
                  type="button"
                  className="interna-galeria-miniatura"
                  aria-label={`Mostrar ${foto.alt}`}
                  aria-current={i === ativa ? "true" : undefined}
                  onClick={() => mostrar(i)}
                >
                  <Image src={foto.url} alt="" fill sizes="132px" style={{ objectFit: "cover" }} />
                </button>
              </li>
            ))}
          </ul>
          <div className="interna-galeria-pontos" aria-hidden="true">
            {fotos.map((foto, i) => (
              <span key={foto.url} data-ativo={i === ativa} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
