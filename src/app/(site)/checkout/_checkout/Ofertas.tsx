"use client";

import type { Ref } from "react";
import { Button, ButtonLink, ProductCard } from "@/components/ds";
import { FotoProduto, hrefDoProduto, PrecoProduto } from "@/components/site/CardProduto";
import { acaoDaOferta, type Oferta } from "@/lib/checkout/ofertas";
import { variacaoDoProduto } from "@/lib/vitrine/variacao";

// Ofertas do rodapé do checkout (sem handoff: cartão da vitrine com foto,
// nome e preço com a unidade de venda; sem o mínimo, decisão do Cainan).
// O avulso entra direto no carrinho com a quantidade mínima (quem chama
// avisa quanto entrou); Cento, Bolo e Bento Cake levam à interna para
// escolher sabores, recheio ou tamanho. A lista já chega filtrada
// (selecionarOfertas).

function rotuloDaInterna(oferta: Oferta): string {
  return variacaoDoProduto(oferta) === "cento" ? "Escolher sabores" : "Escolher recheio";
}

export function Ofertas({
  ofertas,
  dataEscolhida,
  aoAdicionar,
  tituloRef,
}: {
  ofertas: Oferta[];
  dataEscolhida: boolean;
  aoAdicionar: (oferta: Oferta) => void;
  tituloRef?: Ref<HTMLHeadingElement>;
}) {
  if (ofertas.length === 0) return null;
  return (
    <section className="checkout-ofertas" aria-labelledby="checkout-ofertas-titulo">
      <div className="site-container">
        <div className="checkout-ofertas-cabeca">
          <h2 id="checkout-ofertas-titulo" ref={tituloRef} tabIndex={-1}>
            Para completar a festa
          </h2>
          <p>
            {dataEscolhida
              ? "Tudo aqui fica pronto a tempo para a data que você escolheu."
              : "Escolha a data para ver só o que fica pronto a tempo."}
          </p>
        </div>
        <ul className="checkout-ofertas-lista">
          {ofertas.map((oferta) => {
            const tituloId = `oferta-${oferta.id}`;
            const href = hrefDoProduto(oferta);
            return (
              <li key={oferta.id} data-oferta={oferta.id}>
                <ProductCard
                  href={href}
                  title={oferta.nome}
                  titleId={tituloId}
                  compact
                  media={<FotoProduto produto={oferta} sizes="(max-width: 767px) 200px, 220px" />}
                >
                  <PrecoProduto produto={oferta} />
                  {acaoDaOferta(oferta) === "adicionar" ? (
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      fullWidth
                      iconLeft="add"
                      aria-describedby={tituloId}
                      className="checkout-oferta-btn"
                      style={{ minHeight: "var(--tap-min)" }}
                      data-nao-fecha-avisos
                      onClick={() => aoAdicionar(oferta)}
                    >
                      Adicionar
                    </Button>
                  ) : (
                    <ButtonLink
                      href={href}
                      variant="secondary"
                      size="sm"
                      fullWidth
                      iconRight="arrow_forward"
                      aria-describedby={tituloId}
                      className="checkout-oferta-btn"
                      style={{ minHeight: "var(--tap-min)" }}
                    >
                      {rotuloDaInterna(oferta)}
                    </ButtonLink>
                  )}
                </ProductCard>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
