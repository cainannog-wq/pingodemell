"use client";

import { useState } from "react";
import { Seletor } from "@/components/site/Seletor";
import { normalizarObservacao } from "@/lib/carrinho/regras";
import { formatMoeda } from "@/lib/pedidos/format";
import type { ProdutoVitrine } from "@/lib/vitrine/mais-pedidos";
import { nomeDaUnidade, textoQuantidadeNaUnidade } from "@/lib/vitrine/minimo";
import {
  erroQuantidade,
  normalizarQuantidade,
  passoDoStep,
  passoQuantidade,
  quantidadeInicial,
  quantidadeMaxima,
} from "@/lib/vitrine/quantidade";
import { Observacao } from "./Observacao";
import { useAdicionarEIrAoCarrinho } from "./edicao";
import { PainelAdicionar } from "./PainelAdicionar";

// Configuração do produto avulso (tipo normal): quantidade respeitando o
// pedido mínimo e o step (Livre/5/10) do produto, observação do item,
// subtotal e "Adicionar ao pedido". A quantidade começa no mínimo; os
// botões andam de um step em um step e não passam do mínimo; o número
// digitado à mão é conferido e, ao sair do campo, vai para o valor aceito
// mais próximo.
export function ConfigAvulso({ produto }: { produto: ProdutoVitrine }) {
  const { adicionarEIr, indo } = useAdicionarEIrAoCarrinho();
  const minimo = quantidadeInicial(produto.pedido_minimo, produto.step_quantidade);
  const [texto, setTexto] = useState(String(minimo));
  const [observacao, setObservacao] = useState("");
  const [adicionado, setAdicionado] = useState(false);

  const quantidade = texto === "" ? NaN : Number(texto);
  const erro = texto === "" ? `Quantidade mínima: ${minimo}` : erroQuantidade(quantidade, produto.pedido_minimo, produto.step_quantidade);
  const valida = erro === null;
  const passo = passoDoStep(produto.step_quantidade);
  const preco = Number(produto.preco);
  const unidade = nomeDaUnidade(valida ? quantidade : minimo, produto.unidade_venda);

  function mudarQuantidade(novo: string) {
    setTexto(novo);
    setAdicionado(false);
  }

  function aoAdicionar() {
    if (!valida) return;
    const foi = adicionarEIr({
      tipo: "normal",
      produtoId: produto.id,
      slug: produto.slug,
      nome: produto.nome,
      preco,
      unidade_venda: produto.unidade_venda,
      quantidade,
      // Cópia do momento: a página do carrinho trava a quantidade com isto,
      // sem consultar o banco.
      pedidoMinimo: produto.pedido_minimo,
      step: produto.step_quantidade,
      foto: produto.image_url,
      observacao: normalizarObservacao(observacao),
    });
    if (foi) setAdicionado(true);
  }

  return (
    <>
      <div className="interna-bloco">
        <div className="interna-bloco-topo">
          <label className="interna-bloco-titulo" htmlFor="interna-quantidade">
            Quantidade
          </label>
          {passo > 1 ? <span className="interna-bloco-dica">Em múltiplos de {passo}</span> : null}
        </div>
        <div className="interna-quantidade">
          <Seletor
            rotulo="Quantidade"
            idCampo="interna-quantidade"
            valor={texto}
            invalido={!valida}
            podeMenos={valida ? quantidade > minimo : true}
            podeMais={valida ? quantidade < quantidadeMaxima(produto.step_quantidade) : true}
            aoMenos={() => mudarQuantidade(String(passoQuantidade(quantidade, -1, produto.pedido_minimo, produto.step_quantidade)))}
            aoMais={() => mudarQuantidade(String(passoQuantidade(quantidade, 1, produto.pedido_minimo, produto.step_quantidade)))}
            aoDigitar={mudarQuantidade}
            aoSairDoCampo={() => setTexto(String(normalizarQuantidade(quantidade, produto.pedido_minimo, produto.step_quantidade)))}
          />
          {unidade ? <span className="interna-quantidade-unidade">{unidade}</span> : null}
        </div>
        <p className="interna-campo-erro" aria-live="polite">
          {valida ? "" : erro}
        </p>
      </div>

      <Observacao
        id="interna-observacao"
        valor={observacao}
        aoMudar={(t) => {
          setObservacao(t);
          setAdicionado(false);
        }}
        exemplo="Ex.: tema da festa, cor da forminha, frase no topo..."
      />

      <PainelAdicionar
        subtotal={valida ? quantidade * preco : 0}
        detalhe={`${textoQuantidadeNaUnidade(valida ? quantidade : minimo, produto.unidade_venda)} × ${formatMoeda(preco)}`}
        podeAdicionar={valida}
        erro={valida ? null : erro}
        adicionado={adicionado}
        aoAdicionar={aoAdicionar}
        indo={indo}
      />
    </>
  );
}
