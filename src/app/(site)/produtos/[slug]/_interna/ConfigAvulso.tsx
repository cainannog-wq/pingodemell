"use client";

import { useState } from "react";
import { Seletor } from "@/components/site/Seletor";
import { normalizarObservacao } from "@/lib/carrinho/regras";
import { formatMoeda } from "@/lib/pedidos/format";
import type { RecheioDoProduto } from "@/lib/produtos/recheios-produto";
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
import { EscolhaRecheio } from "./EscolhaRecheio";
import { Observacao } from "./Observacao";
import { useAdicionarEIrAoCarrinho } from "./edicao";
import { PainelAdicionar } from "./PainelAdicionar";
import { useCelular } from "./useCelular";

// No celular o seletor vive na barra fixa do rodapé (ver PainelAdicionar);
// as regras são as mesmas.
//
// Configuração do produto avulso (tipo normal): quantidade respeitando o
// pedido mínimo e o step (Livre/5/10) do produto, observação do item,
// subtotal e "Adicionar ao pedido". A quantidade começa no mínimo; os
// botões andam de um step em um step e não passam do mínimo; o número
// digitado à mão é conferido e, ao sair do campo, vai para o valor aceito
// mais próximo.
//
// Com recheios personalizados (lista do próprio produto: Bolos de tipo normal
// e Bento Cake), a escolha de UM recheio é obrigatória: "Adicionar ao pedido"
// fica bloqueado até escolher. O recheio é informativo e não muda o preço.
export function ConfigAvulso({ produto, recheios = [] }: { produto: ProdutoVitrine; recheios?: RecheioDoProduto[] }) {
  const { adicionarEIr, indo } = useAdicionarEIrAoCarrinho();
  const celular = useCelular();
  const minimo = quantidadeInicial(produto.pedido_minimo, produto.step_quantidade);
  const [texto, setTexto] = useState(String(minimo));
  const [observacao, setObservacao] = useState("");
  const [adicionado, setAdicionado] = useState(false);
  const [recheioId, setRecheioId] = useState<string | null>(null);
  const comRecheios = recheios.length > 0;
  const recheio = recheios.find((r) => r.id === recheioId) ?? null;

  const quantidade = texto === "" ? NaN : Number(texto);
  const erroDaQuantidade = texto === "" ? `Quantidade mínima: ${minimo}` : erroQuantidade(quantidade, produto.pedido_minimo, produto.step_quantidade);
  const erro = erroDaQuantidade ?? (comRecheios && !recheio ? "Escolha o recheio para adicionar." : null);
  const valida = erro === null;
  const quantidadeValida = erroDaQuantidade === null;
  const passo = passoDoStep(produto.step_quantidade);
  const preco = Number(produto.preco);
  const unidade = nomeDaUnidade(quantidadeValida ? quantidade : minimo, produto.unidade_venda);

  function mudarQuantidade(novo: string) {
    setTexto(novo);
    setAdicionado(false);
  }

  function aoAdicionar() {
    if (!valida) return;
    if (comRecheios && !recheio) return;
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
      ...(comRecheios && recheio ? { recheio: { id: recheio.id, nome: recheio.nome } } : {}),
      observacao: normalizarObservacao(observacao),
    });
    if (foi) setAdicionado(true);
  }

  const seletor = (
    <Seletor
      rotulo="Quantidade"
      idCampo="interna-quantidade"
      valor={texto}
      invalido={!quantidadeValida}
      podeMenos={quantidadeValida ? quantidade > minimo : true}
      podeMais={quantidadeValida ? quantidade < quantidadeMaxima(produto.step_quantidade) : true}
      aoMenos={() => mudarQuantidade(String(passoQuantidade(quantidade, -1, produto.pedido_minimo, produto.step_quantidade)))}
      aoMais={() => mudarQuantidade(String(passoQuantidade(quantidade, 1, produto.pedido_minimo, produto.step_quantidade)))}
      aoDigitar={celular ? undefined : mudarQuantidade}
      aoSairDoCampo={() => setTexto(String(normalizarQuantidade(quantidade, produto.pedido_minimo, produto.step_quantidade)))}
    />
  );

  return (
    <>
      {comRecheios ? (
        <EscolhaRecheio
          titulo="Recheio"
          dica="Escolha um. Vale para todas as unidades deste pedido."
          nomeCampo="interna-recheio"
          valor={recheioId}
          aoEscolher={(id) => {
            setRecheioId(id);
            setAdicionado(false);
          }}
          grupos={[{ chave: "produto", rotulo: null, opcoes: recheios.map((r) => ({ id: r.id, nome: r.nome })) }]}
        />
      ) : null}

      {celular ? null : (
      <div className="interna-bloco">
        <div className="interna-bloco-topo">
          <label className="interna-bloco-titulo" htmlFor="interna-quantidade">
            Quantidade
          </label>
          {passo > 1 ? <span className="interna-bloco-dica">Em múltiplos de {passo}</span> : null}
        </div>
        <div className="interna-quantidade">
          {seletor}
          {unidade ? <span className="interna-quantidade-unidade">{unidade}</span> : null}
        </div>
        <p className="interna-campo-erro" aria-live="polite">
          {quantidadeValida ? "" : erroDaQuantidade}
        </p>
      </div>
      )}

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
        subtotal={quantidadeValida ? quantidade * preco : 0}
        detalhe={`${textoQuantidadeNaUnidade(quantidadeValida ? quantidade : minimo, produto.unidade_venda)} × ${formatMoeda(preco)}`}
        podeAdicionar={valida}
        erro={valida ? null : erro}
        adicionado={adicionado}
        aoAdicionar={aoAdicionar}
        indo={indo}
        barra={
          celular
            ? {
                seletor: (
                  <>
                    {seletor}
                    {unidade ? <span className="interna-barra-unidade">{unidade}</span> : null}
                  </>
                ),
                linhaTopo: passo > 1 ? <p className="interna-barra-dica">Em múltiplos de {passo}</p> : null,
              }
            : undefined
        }
      />
    </>
  );
}
