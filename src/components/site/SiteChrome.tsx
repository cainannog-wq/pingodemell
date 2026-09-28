import type { ReactNode } from "react";
import { WhatsAppFab } from "@/components/ds";
import { LINK_WHATSAPP_CONTATO } from "@/lib/site/whatsapp";
import { CarrinhoProvider } from "./CarrinhoProvider";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";
import "./site.css";

// Estrutura global do site público (cabeçalho, rodapé e botão flutuante do
// WhatsApp). Usada pelo layout de app/(site) e pela 404 raiz — a 404 não
// passa pelo layout do grupo, então precisa montar a mesma estrutura.
// O carrinho (CarrinhoProvider) vale para todas as páginas do site: o
// contador do cabeçalho e o "Adicionar ao pedido" da interna leem o mesmo
// estado.
export function SiteChrome({ children }: { children: ReactNode }) {
  return (
    <CarrinhoProvider>
      <div className="pdm-site">
        <a href="#conteudo" className="site-skip">
          Pular para o conteúdo
        </a>
        <SiteHeader />
        <main id="conteudo" className="site-main">
          {children}
        </main>
        <SiteFooter />
        <WhatsAppFab href={LINK_WHATSAPP_CONTATO} label="Fale conosco" className="site-fab" />
      </div>
    </CarrinhoProvider>
  );
}
