"use client";

import { useEffect, useRef } from "react";
import { Button, TextLink } from "@/components/ds";
import { ROTAS } from "@/lib/site/rotas";
import { useConsentimento } from "./ConsentimentoProvider";

// Banner de consentimento de cookies (PR 2 da Fase 4). Faixa fixa na base,
// sem prender nem roubar o foco ao aparecer; na reabertura pelo rodapé, o
// foco vem para ele. Só existe com ID do GA4 efetivo e depois de montar
// (ConsentimentoProvider).
//
// Convivência (site.css, "Banner de consentimento"): a altura do banner e a
// da barra fixa da página (carrinho ou interna, só no celular) são medidas
// aqui e viram --banner-altura e --banner-base no <html>. O banner fica
// acima da barra; o botão flutuante e os avisos sobem pela propriedade
// translate (não mexe em bottom: sem mudança de layout contada no CLS); um
// espaçador no fim da página e o scroll-padding-bottom evitam que o banner
// cubra o fim da página e o foco do teclado.

const BARRAS_FIXAS = ".carrinho-barra, .interna-barra";

function barraFixaVisivel(): Element | undefined {
  return Array.from(document.querySelectorAll(BARRAS_FIXAS)).find(
    (el) => getComputedStyle(el).position === "fixed" && el.getBoundingClientRect().height > 0
  );
}

export function BannerConsentimento() {
  const { aberto, reaberto, consentimento, escolher } = useConsentimento();
  const banner = useRef<HTMLElement>(null);

  useEffect(() => {
    const raiz = document.documentElement;
    const el = banner.current;
    if (!aberto || !el) return;
    let barraObservada: Element | undefined;
    let pendente = 0;
    const observador = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => agendar());
    function medir() {
      pendente = 0;
      if (!el) return;
      const barra = barraFixaVisivel();
      raiz.style.setProperty("--banner-altura", `${Math.ceil(el.getBoundingClientRect().height)}px`);
      raiz.style.setProperty("--banner-base", `${barra ? Math.ceil(barra.getBoundingClientRect().height) : 0}px`);
      el.dataset.sobreBarra = barra ? "true" : "false";
      if (barra !== barraObservada) {
        if (barraObservada) observador?.unobserve(barraObservada);
        if (barra) observador?.observe(barra);
        barraObservada = barra;
      }
    }
    function agendar() {
      if (!pendente) pendente = requestAnimationFrame(medir);
    }
    observador?.observe(el);
    // A barra do carrinho some quando ele esvazia, e a da interna muda de
    // altura com o aviso: qualquer mudança na página remede.
    const mudancas = typeof MutationObserver === "undefined" ? null : new MutationObserver(agendar);
    mudancas?.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", agendar);
    medir();
    return () => {
      if (pendente) cancelAnimationFrame(pendente);
      observador?.disconnect();
      mudancas?.disconnect();
      window.removeEventListener("resize", agendar);
      raiz.style.removeProperty("--banner-altura");
      raiz.style.removeProperty("--banner-base");
    };
  }, [aberto]);

  // Reaberto pelo rodapé: o foco vem para o banner.
  useEffect(() => {
    if (aberto && reaberto) banner.current?.focus();
  }, [aberto, reaberto]);

  if (!aberto) return null;
  const atual = reaberto && consentimento ? consentimento.escolha : null;

  return (
    <section ref={banner} className="site-consentimento" role="region" aria-label="Preferências de privacidade" tabIndex={-1}>
      <div className="site-container site-consentimento-inner">
        <div className="site-consentimento-textos">
          <p>
            Usamos cookies para melhorar a sua experiência. Saiba mais na{" "}
            {/* Inline e sublinhado: link dentro da frase (a frase não quebra
                antes dele, e ele se distingue do texto sem depender da cor). */}
            <TextLink href={ROTAS.privacidade} style={{ display: "inline", textDecoration: "underline" }}>
              Política de Privacidade
            </TextLink>
            .
          </p>
          {atual ? (
            <p className="site-consentimento-atual">Sua escolha atual: {atual === "aceito" ? "Aceito" : "Recusado"}</p>
          ) : null}
        </div>
        <div className="site-consentimento-botoes">
          <Button type="button" variant="secondary" size="md" aria-pressed={atual ? atual === "aceito" : undefined} onClick={() => escolher("aceito")}>
            Aceitar
          </Button>
          <Button type="button" variant="secondary" size="md" aria-pressed={atual ? atual === "recusado" : undefined} onClick={() => escolher("recusado")}>
            Recusar
          </Button>
        </div>
      </div>
    </section>
  );
}

// Espaço no fim da página com a altura do banner (0 sem banner): o fim da
// página e o botão final do checkout podem rolar para cima dele.
export function EspacoDoBanner() {
  return <div className="site-consentimento-espaco" aria-hidden="true" />;
}
