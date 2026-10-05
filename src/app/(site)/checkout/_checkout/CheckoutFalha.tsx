import { ButtonLink, Icon } from "@/components/ds";
import { ROTAS } from "@/lib/site/rotas";
import { LINK_WHATSAPP_CONTATO, atributosWhatsApp } from "@/lib/site/whatsapp";

// Falha do banco ao ler o calendário (dias sem produção) ou os produtos:
// sem isso as datas liberadas não são confiáveis, então o formulário não
// aparece. O carrinho continua salvo no navegador.
export function CheckoutFalha() {
  return (
    <section className="checkout-falha" aria-labelledby="checkout-falha-titulo">
      <div className="site-container checkout-falha-inner">
        <Icon name="event_busy" size={48} color="var(--brown-500)" />
        <h1 id="checkout-falha-titulo">Não conseguimos abrir o calendário agora</h1>
        <p>Seu pedido continua salvo. Tente de novo em instantes ou fale com a gente pelo WhatsApp.</p>
        <div className="checkout-falha-ctas">
          <ButtonLink href={ROTAS.checkout} variant="primary" size="md" iconLeft="refresh">
            Tentar de novo
          </ButtonLink>
          <ButtonLink href={ROTAS.carrinho} variant="secondary" size="md" iconLeft="arrow_back">
            Voltar ao pedido
          </ButtonLink>
          <ButtonLink {...atributosWhatsApp("checkout_falha", LINK_WHATSAPP_CONTATO)} variant="whatsapp" size="md" iconLeft="whatsapp">
            Falar com a gente
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
