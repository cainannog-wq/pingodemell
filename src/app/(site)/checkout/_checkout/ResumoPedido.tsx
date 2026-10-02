"use client";

import { Icon, TextLink } from "@/components/ds";
import { DetalhesDaLinha, FotoDaLinha, textoQuantidadeDaLinha } from "@/components/site/LinhaDoPedido";
import { subtotalDaLinha, totalDoCarrinho, type LinhaCarrinho } from "@/lib/carrinho/regras";
import { formatMoeda } from "@/lib/pedidos/format";
import { ROTAS } from "@/lib/site/rotas";
import { TEXTO_DECORACAO } from "@/lib/vitrine/bolo";

// Resumo do pedido no checkout: as linhas do carrinho como estão gravadas
// no navegador (mesma exibição por tipo do carrinho), sem controle de
// quantidade nem edição. Para mudar, a cliente volta ao carrinho. O total é
// a soma do que está gravado: nenhuma consulta ao banco, nenhum aviso de
// "o preço pode ter mudado" (decisão do Cainan).
export function ResumoPedido({ linhas }: { linhas: LinhaCarrinho[] }) {
  const temBolo = linhas.some((l) => l.tipo === "bolo");
  return (
    <section className="checkout-resumo" aria-labelledby="checkout-resumo-titulo">
      <div className="checkout-resumo-cabeca">
        <h2 id="checkout-resumo-titulo">Resumo do pedido</h2>
        <TextLink href={ROTAS.carrinho}>
          Editar
          <Icon name="edit" size={18} tone="inherit" />
        </TextLink>
      </div>
      <ul className="checkout-resumo-itens" aria-label="Itens do pedido">
        {linhas.map((linha) => (
          <li key={linha.id} className="checkout-resumo-item" data-linha={linha.id}>
            <div className="checkout-resumo-foto">
              <FotoDaLinha foto={linha.foto} nome={linha.nome} sizes="56px" />
            </div>
            <div className="checkout-resumo-texto">
              <p className="checkout-resumo-nome">{linha.nome}</p>
              <div className="checkout-resumo-detalhes">
                <DetalhesDaLinha linha={linha} />
                {linha.tipo === "normal" || linha.tipo === "bento" ? <p>Quantidade: {textoQuantidadeDaLinha(linha)}</p> : null}
                {linha.observacao ? (
                  <p className="checkout-resumo-obs">
                    <span className="site-visually-hidden">Observação: </span>
                    <Icon name="edit_note" size={16} tone="inherit" />
                    {linha.observacao}
                  </p>
                ) : null}
              </div>
            </div>
            <span className="checkout-resumo-subtotal">
              <span className="site-visually-hidden">Subtotal: </span>
              {formatMoeda(subtotalDaLinha(linha))}
            </span>
          </li>
        ))}
      </ul>
      <div className="checkout-resumo-total">
        <span>Total</span>
        <strong>{formatMoeda(totalDoCarrinho(linhas))}</strong>
      </div>
      {temBolo ? (
        <p className="checkout-resumo-info">
          <Icon name="info" size={20} color="var(--pdm-info)" />
          <span>{TEXTO_DECORACAO}</span>
        </p>
      ) : null}
    </section>
  );
}
