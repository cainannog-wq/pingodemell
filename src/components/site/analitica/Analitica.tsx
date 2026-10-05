"use client";

import { usePathname, useSearchParams } from "next/navigation";
import Script from "next/script";
import { Suspense, useEffect, useState } from "react";
import { useConsentimento } from "@/components/site/consentimento/ConsentimentoProvider";
import { enviarEvento, iniciarGtag, registrarPageView } from "@/lib/analitica/gtag";
import { ehOrigemWhatsApp } from "@/lib/site/whatsapp";

// GA4 no site público (PR 2 da Fase 4), dentro do SiteChrome. Sem ID
// efetivo ou sem a escolha "aceito", não renderiza nada: nem script, nem
// dataLayer, nem gtag. Com os dois:
// - cria a fila do gtag e a configuração (src/lib/analitica/gtag.ts) e
//   carrega o gtag.js por next/script (afterInteractive);
// - manda page_view a cada troca de caminho ou de ?categoria=
//   (usePathname e useSearchParams dentro de Suspense, exigência do Next 16
//   para não perder o pré-render);
// - ouve os cliques em links wa.me e manda whatsapp_clique só com a origem
//   do link (data-whatsapp-origem, de atributosWhatsApp). O link abre a nova
//   aba como sempre: o evento sai dentro do mesmo clique, sem atrasar nada.
export function Analitica() {
  const { id, consentimento } = useConsentimento();
  if (!id || consentimento?.escolha !== "aceito") return null;
  return <AnaliticaAtiva id={id} />;
}

function AnaliticaAtiva({ id }: { id: string }) {
  // A fila e a configuração existem antes de o script ser pedido.
  useState(() => iniciarGtag(id));

  useEffect(() => {
    function aoClicar(evento: MouseEvent) {
      const alvo = evento.target instanceof Element ? evento.target.closest("a[data-whatsapp-origem]") : null;
      const origem = alvo?.getAttribute("data-whatsapp-origem");
      if (ehOrigemWhatsApp(origem)) enviarEvento("whatsapp_clique", { origem });
    }
    document.addEventListener("click", aoClicar, true);
    return () => document.removeEventListener("click", aoClicar, true);
  }, []);

  return (
    <>
      <Script id="ga4-gtag" src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`} strategy="afterInteractive" />
      <Suspense fallback={null}>
        <VisualizacaoDePagina />
      </Suspense>
    </>
  );
}

function VisualizacaoDePagina() {
  const caminho = usePathname();
  const busca = useSearchParams();
  const endereco = `${caminho}?${busca.toString()}`;
  useEffect(() => {
    registrarPageView();
  }, [endereco]);
  return null;
}
