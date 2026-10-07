"use client";

import { Button, Icon } from "@/components/ds";
import { formatMoeda } from "@/lib/pedidos/format";

// Subtotal + "Adicionar ao pedido", igual para o avulso e o Cento.
// Desktop: caixa na coluna de configuração. Celular: barra fixa na base
// da tela (como no layout), com o mesmo botão. `erro` explica por que o
// botão está desligado; `adicionado` confirma que o item foi para o
// carrinho (anunciado ao leitor de tela).
export function PainelAdicionar({
  subtotal,
  detalhe,
  podeAdicionar,
  erro,
  adicionado,
  aoAdicionar,
  indo = false,
  rotulo = "Adicionar ao pedido",
  rotuloBarra = "Adicionar",
  mensagemAdicionado = "Adicionado ao pedido",
}: {
  subtotal: number;
  // "10 unidades × R$ 2,50", "2 centos × R$ 95,99".
  detalhe: string;
  podeAdicionar: boolean;
  erro: string | null;
  adicionado: boolean;
  aoAdicionar: () => void;
  // Confirmado e a caminho do carrinho: botão desligado até a página sair.
  indo?: boolean;
  // Em modo edição (Cento e Bolo) o botão é "Salvar alteração" / "Salvar".
  rotulo?: string;
  rotuloBarra?: string;
  // Confirmação depois de adicionar (a de sempre, ou o aviso de que a edição
  // virou item novo).
  mensagemAdicionado?: string;
}) {
  const valor = formatMoeda(subtotal);
  const aviso = adicionado ? (
    <p className="interna-adicionado">
      <Icon name="check_circle" size={20} tone="inherit" />
      {mensagemAdicionado}
    </p>
  ) : erro ? (
    <p className="interna-painel-erro">{erro}</p>
  ) : null;

  return (
    <>
      <div className="interna-resumo">
        <div className="interna-resumo-linha">
          <div className="interna-resumo-textos">
            <span className="interna-resumo-rotulo">Subtotal</span>
            <span className="interna-resumo-detalhe">{detalhe}</span>
          </div>
          <span className="interna-resumo-valor" data-apagado={!podeAdicionar}>
            {valor}
          </span>
        </div>
        <Button variant="primary" size="lg" fullWidth iconLeft="add_shopping_cart" disabled={!podeAdicionar || indo} onClick={aoAdicionar}>
          {rotulo}
        </Button>
        {aviso}
        <p className="interna-resumo-nota">Nada é cobrado aqui. Você fecha o pedido com a gente no WhatsApp.</p>
      </div>

      {/* Anúncio para leitor de tela, um só para a caixa e a barra (a caixa
          some no celular e a barra some no desktop). */}
      <div role="status" className="site-visually-hidden">
        {adicionado ? `${mensagemAdicionado.replace(/.$/, "")}.` : ""}
      </div>

      {/* Barra fixa do celular: mesmo subtotal e mesmo botão. */}
      <div className="interna-barra">
        {aviso ? <div className="interna-barra-aviso">{aviso}</div> : null}
        <div className="interna-barra-linha">
          <div className="interna-resumo-textos">
            <span className="interna-resumo-rotulo">Subtotal</span>
            <span className="interna-barra-valor" data-apagado={!podeAdicionar}>
              {valor}
            </span>
          </div>
          <Button variant="primary" size="md" fullWidth iconLeft="add_shopping_cart" disabled={!podeAdicionar || indo} onClick={aoAdicionar}>
            {rotuloBarra}
          </Button>
        </div>
      </div>
    </>
  );
}
