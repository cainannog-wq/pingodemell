import type { ReactNode } from "react";
import { WhatsAppFab } from "@/components/ds";
import { LINK_WHATSAPP_CONTATO } from "@/lib/site/whatsapp";
import { CarrinhoProvider } from "./CarrinhoProvider";
import { BannerConsentimento, EspacoDoBanner } from "./consentimento/BannerConsentimento";
import { ConsentimentoProvider } from "./consentimento/ConsentimentoProvider";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";
import "./site.css";

// Estrutura global do site público (cabeçalho, rodapé e botão flutuante do
// WhatsApp). Usada pelo layout de app/(site) e pela 404 raiz — a 404 não
// passa pelo layout do grupo, então precisa montar a mesma estrutura.
// O carrinho (CarrinhoProvider) vale para todas as páginas do site: o
// contador do cabeçalho e o "Adicionar ao pedido" da interna leem o mesmo
// estado. O ConsentimentoProvider (PR 2 da Fase 4) guarda a escolha de
// cookies: o banner vem logo depois do "Pular para o conteúdo" na ordem do
// documento (fixo na base da tela) e o link de preferências, no rodapé.
export function SiteChrome({ children }: { children: ReactNode }) {
  return (
    <CarrinhoProvider>
      <ConsentimentoProvider>
        <div className="pdm-site">
          <a href="#conteudo" className="site-skip">
            Pular para o conteúdo
          </a>
          <BannerConsentimento />
          <SiteHeader />
          <main id="conteudo" className="site-main">
            {children}
          </main>
          <SiteFooter />
          <WhatsAppFab href={LINK_WHATSAPP_CONTATO} label="Fale conosco" className="site-fab" />
          <EspacoDoBanner />
        </div>
      </ConsentimentoProvider>
    </CarrinhoProvider>
  );
}
