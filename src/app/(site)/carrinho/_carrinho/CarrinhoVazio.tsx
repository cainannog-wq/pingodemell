import type { ReactNode } from "react";
import { ButtonLink, Icon } from "@/components/ds";
import { Hive } from "@/components/site/Hive";
import { ROTAS } from "@/lib/site/rotas";
import { LINK_WHATSAPP_CONTATO } from "@/lib/site/whatsapp";

// Carrinho sem linhas (design: vazio-d.png). Volta para o catálogo ou fala
// com a loja no WhatsApp. `extra`: o checkout, depois de um envio, põe aqui o
// link para o último pedido enviado.
export function CarrinhoVazio({ extra }: { extra?: ReactNode } = {}) {
  return (
    <section className="carrinho-vazio" aria-labelledby="carrinho-vazio-titulo">
      <Hive />
      <div className="site-container carrinho-vazio-inner">
        <span className="carrinho-vazio-icone">
          <Icon name="shopping_bag" size={56} color="var(--brown-500)" />
        </span>
        <h1 id="carrinho-vazio-titulo">Seu pedido ainda está vazinho</h1>
        <p className="carrinho-vazio-lead">
          Dá uma olhada no catálogo: tem bolo, salgado, doce e kit festa esperando pela sua data 💛
        </p>
        <div className="carrinho-vazio-ctas">
          <ButtonLink href={ROTAS.lista} variant="primary" size="lg" iconRight="arrow_forward">
            Ver o catálogo
          </ButtonLink>
          <ButtonLink href={LINK_WHATSAPP_CONTATO} variant="whatsapp" size="lg" iconLeft="whatsapp" target="_blank" rel="noopener noreferrer">
            Falar com a gente
          </ButtonLink>
        </div>
        {extra ? <p className="carrinho-vazio-extra">{extra}</p> : null}
      </div>
    </section>
  );
}
