"use client";

import { useState } from "react";
import { Seletor } from "@/components/site/Seletor";
import { normalizarObservacao } from "@/lib/carrinho/regras";
import { formatMoeda } from "@/lib/pedidos/format";
import { recheiosDoBento } from "@/lib/recheios/regras";
import type { RecheioVitrine } from "@/lib/vitrine/disponibilidade";
import type { ProdutoVitrine } from "@/lib/vitrine/mais-pedidos";
import { erroQuantidade, normalizarQuantidade, passoQuantidade, quantidadeInicial, quantidadeMaxima } from "@/lib/vitrine/quantidade";
import { EscolhaRecheio } from "./EscolhaRecheio";
import { Observacao } from "./Observacao";
import { useAdicionarEIrAoCarrinho } from "./edicao";
import { PainelAdicionar } from "./PainelAdicionar";

// Configuração do produto tipo Bento Cake: cada tema é um produto com preço
// fixo e peso fechado. O cliente escolhe UM recheio (lista simples, sem
// grupo e sem preço: informativo) que vale para todas as unidades do
// pedido, e a quantidade (respeitando o pedido mínimo do cadastro; o Bento
// não usa step). Recheios diferentes são linhas diferentes do carrinho.
export function ConfigBento({ produto, recheios }: { produto: ProdutoVitrine; recheios: RecheioVitrine[] }) {
  const { adicionarEIr, indo } = useAdicionarEIrAoCarrinho();
  const opcoes = recheiosDoBento(recheios);
  const minimo = quantidadeInicial(produto.pedido_minimo, "livre");
  const [texto, setTexto] = useState(String(minimo));
  const [recheioId, setRecheioId] = useState<string | null>(null);
  const [observacao, setObservacao] = useState("");
  const [adicionado, setAdicionado] = useState(false);

  const quantidade = texto === "" ? NaN : Number(texto);
  const erroDaQuantidade = texto === "" ? `Quantidade mínima: ${minimo}` : erroQuantidade(quantidade, produto.pedido_minimo, "livre");
  const recheio = opcoes.find((r) => r.id === recheioId) ?? null;
  const valida = erroDaQuantidade === null && recheio !== null;
  const erro = erroDaQuantidade ?? (recheio ? null : "Escolha o recheio para adicionar.");
  const preco = Number(produto.preco);

  function alterar<T>(definir: (v: T) => void) {
    return (v: T) => {
      definir(v);
      setAdicionado(false);
    };
  }

  function aoAdicionar() {
    if (!valida || !recheio) return;
    const foi = adicionarEIr({
      tipo: "bento",
      produtoId: produto.id,
      slug: produto.slug,
      nome: produto.nome,
      preco,
      quantidade,
      recheio: { id: recheio.id, nome: recheio.nome },
      // Cópia do momento (ver ConfigAvulso).
      pedidoMinimo: produto.pedido_minimo,
      foto: produto.image_url,
      observacao: normalizarObservacao(observacao),
    });
    if (foi) setAdicionado(true);
  }

  return (
    <>
      <EscolhaRecheio
        titulo="Recheio"
        dica="Escolha um. Vale para todas as unidades deste pedido."
        nomeCampo="interna-recheio"
        valor={recheioId}
        aoEscolher={alterar(setRecheioId)}
        grupos={[{ chave: "bento", rotulo: null, opcoes: opcoes.map((r) => ({ id: r.id, nome: r.nome })) }]}
      />

      <div className="interna-bloco">
        <div className="interna-bloco-topo">
          <label className="interna-bloco-titulo" htmlFor="interna-quantidade">
            Quantidade
          </label>
        </div>
        <div className="interna-quantidade">
          <Seletor
            rotulo="Quantidade"
            idCampo="interna-quantidade"
            valor={texto}
            invalido={erroDaQuantidade !== null}
            podeMenos={erroDaQuantidade === null ? quantidade > minimo : true}
            podeMais={erroDaQuantidade === null ? quantidade < quantidadeMaxima("livre") : true}
            aoMenos={() => alterar(setTexto)(String(passoQuantidade(quantidade, -1, produto.pedido_minimo, "livre")))}
            aoMais={() => alterar(setTexto)(String(passoQuantidade(quantidade, 1, produto.pedido_minimo, "livre")))}
            aoDigitar={alterar(setTexto)}
            aoSairDoCampo={() => setTexto(String(normalizarQuantidade(quantidade, produto.pedido_minimo, "livre")))}
          />
          <span className="interna-quantidade-unidade">{quantidade === 1 ? "unidade" : "unidades"}</span>
        </div>
        <p className="interna-campo-erro" aria-live="polite">
          {erroDaQuantidade ?? ""}
        </p>
      </div>

      <Observacao
        id="interna-observacao"
        valor={observacao}
        aoMudar={alterar(setObservacao)}
        exemplo="Ex.: nome e idade no topo, cores da decoração..."
      />

      <PainelAdicionar
        subtotal={valida ? quantidade * preco : 0}
        detalhe={`${valida ? quantidade : minimo} × ${formatMoeda(preco)}`}
        podeAdicionar={valida}
        erro={valida ? null : erro}
        adicionado={adicionado}
        aoAdicionar={aoAdicionar}
        indo={indo}
      />
    </>
  );
}
