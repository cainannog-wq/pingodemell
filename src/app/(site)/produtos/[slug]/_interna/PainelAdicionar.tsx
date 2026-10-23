"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Button, Icon } from "@/components/ds";
import { formatMoeda } from "@/lib/pedidos/format";

// Subtotal + "Adicionar ao pedido", igual para o avulso e o Cento.
// Desktop: caixa na coluna de configuração. Celular: barra fixa na base
// da tela (como no layout), com o mesmo botão. `erro` explica por que o
// botão está desligado; `adicionado` confirma que o item foi para o
// carrinho (anunciado ao leitor de tela).
// Conteúdo extra da barra fixa do celular (só passado quando a tela é de
// celular): o seletor sai do corpo da página e vive aqui, ao lado do subtotal
// e do botão.
export type BarraDoCelular = {
  seletor: ReactNode;
  // Valor do subtotal da barra quando difere do da caixa (mesmo tamanho).
  valor?: string;
  // Texto curto no lugar do valor (ex.: "Escolha o recheio"), em fonte menor.
  textoSubtotal?: string;
  // Linha no topo da barra (ex.: o aviso do WhatsApp do Bolo).
  linhaTopo?: ReactNode;
  // Troca o erro mostrado na barra (null = nenhum).
  erro?: string | null;
};

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
  barra,
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
  barra?: BarraDoCelular;
}) {
  // A barra fixa na base vale também no desktop, para todo tipo de produto (no
  // lugar da caixa de subtotal), com o detalhe da conta ("10 pessoas × R$ 22,00").
  // A barra muda de altura (seletor, linha do WhatsApp, avisos): a altura
  // medida vira --interna-barra-altura no <html>, e o CSS reserva esse espaço
  // no fim da página para a barra não cobrir o último conteúdo.
  const barraRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const barra = barraRef.current;
    if (!barra || typeof ResizeObserver === "undefined") return;
    const raiz = document.documentElement;
    // Barra escondida (desktop, ou a cópia que a Suspense descarta) mede 0 e
    // não mexe na medida de quem está visível.
    let minha = "";
    const medir = () => {
      const altura = barra.getBoundingClientRect().height;
      if (altura <= 0) return;
      minha = `${Math.ceil(altura)}px`;
      raiz.style.setProperty("--interna-barra-altura", minha);
    };
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(barra);
    return () => {
      observador.disconnect();
      if (minha && raiz.style.getPropertyValue("--interna-barra-altura") === minha) raiz.style.removeProperty("--interna-barra-altura");
    };
  }, []);
  const valor = formatMoeda(subtotal);
  const erroDaBarra = barra && barra.erro !== undefined ? barra.erro : erro;
  const avisoDaBarra = adicionado ? (
    <p className="interna-adicionado">
      <Icon name="check_circle" size={20} tone="inherit" />
      {mensagemAdicionado}
    </p>
  ) : erroDaBarra ? (
    <p className="interna-painel-erro">{erroDaBarra}</p>
  ) : null;
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
      <div className="interna-resumo" data-escondido-desktop>
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
      <div className="interna-barra" ref={barraRef} data-desktop>
        {barra?.linhaTopo}
        {avisoDaBarra ? <div className="interna-barra-aviso">{avisoDaBarra}</div> : null}
        <div className={barra ? "interna-barra-linha interna-barra-linha--seletor" : "interna-barra-linha"}>
          {barra ? <div className="interna-barra-seletor">{barra.seletor}</div> : null}
          <div className="interna-resumo-textos">
            <span className="interna-resumo-rotulo">Subtotal</span>
            {barra ? null : <span className="interna-barra-detalhe">{detalhe}</span>}
            <span className="interna-barra-valor" data-apagado={!podeAdicionar} data-texto={barra?.textoSubtotal ? true : undefined}>
              {barra?.textoSubtotal ?? barra?.valor ?? valor}
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
