"use client";

import { useState } from "react";
import { Icon } from "@/components/ds";
import { Seletor } from "@/components/site/Seletor";
import { normalizarObservacao } from "@/lib/carrinho/regras";
import { formatMoeda } from "@/lib/pedidos/format";
import {
  alterarSabor,
  composicaoValida,
  distribuicaoInicial,
  MAX_CENTOS,
  PASSO_SABOR,
  passoCentos,
  podeAumentar,
  situacaoDistribuicao,
  type Distribuicao,
} from "@/lib/vitrine/cento";
import type { ProdutoVitrine } from "@/lib/vitrine/mais-pedidos";
import { AVISO_VIROU_ITEM_NOVO, ROTULO_ADICIONAR, ROTULO_SALVAR, useConfirmacao, type Edicao } from "./edicao";
import { Observacao } from "./Observacao";
import { PainelAdicionar } from "./PainelAdicionar";

function textoCentos(n: number): string {
  return `${n} ${n === 1 ? "cento" : "centos"}`;
}

// Configuração do produto tipo Cento (regras em src/lib/vitrine/cento.ts):
// número de centos (1, 2, 3..., sem pedido mínimo nem step do cadastro) e
// a distribuição das 100 × centos unidades entre os sabores ativos, numa
// combinação só, em passos de 10. O botão só liga com a soma exata.
// Com 1 sabor ativo, o total inteiro vai para ele, sem distribuição.
//
// Em modo edição (edicao, vindo do ?editar= do carrinho) começa preenchido com
// o que está gravado na linha: número de centos, distribuição e observação.
// Sabor que já não está ativo não entra; a soma só fecha quando a cliente
// completa.
export function ConfigCento({ produto, sabores, edicao }: { produto: ProdutoVitrine; sabores: string[]; edicao?: Edicao }) {
  const { confirmar, emEdicao, virouNovo, indo } = useConfirmacao(edicao);
  const gravada = edicao?.linha.tipo === "cento" ? edicao.linha : null;
  const [centos, setCentos] = useState(gravada?.quantidade ?? 1);
  const [distribuicao, setDistribuicao] = useState<Distribuicao>(() => {
    if (!gravada) return distribuicaoInicial(sabores, 1);
    const salvos = new Map(gravada.sabores.map((s) => [s.nome, s.quantidade]));
    return Object.fromEntries(sabores.map((nome) => [nome, salvos.get(nome) ?? 0]));
  });
  const [observacao, setObservacao] = useState(gravada?.observacao ?? "");
  const [adicionado, setAdicionado] = useState(false);

  const umSabor = sabores.length === 1;
  // Com 1 sabor a distribuição acompanha o número de centos sozinha.
  const atual = umSabor ? distribuicaoInicial(sabores, centos) : distribuicao;
  const situacao = situacaoDistribuicao(atual, centos);
  const valida = composicaoValida(atual, sabores, centos);
  const preco = Number(produto.preco);

  const erro = situacao.sobra > 0
    ? `Passou ${situacao.sobra} unidades. Tire de algum sabor para fechar ${situacao.total}.`
    : situacao.falta > 0
      ? `Complete as ${situacao.total} unidades para adicionar.`
      : null;

  function mudarCentos(direcao: 1 | -1) {
    setCentos((c) => passoCentos(c, direcao));
    setAdicionado(false);
  }

  function mudarSabor(sabor: string, direcao: 1 | -1) {
    setDistribuicao((d) => alterarSabor(d, sabor, direcao, centos));
    setAdicionado(false);
  }

  function aoAdicionar() {
    if (!valida) return;
    const resultado = confirmar({
      tipo: "cento",
      produtoId: produto.id,
      slug: produto.slug,
      nome: produto.nome,
      preco,
      quantidade: centos,
      sabores: sabores.map((nome) => ({ nome, quantidade: atual[nome] })),
      foto: produto.image_url,
      observacao: normalizarObservacao(observacao),
    });
    if (resultado === "adicionou") setAdicionado(true);
  }

  const cor = situacao.completa ? "ok" : situacao.soma === 0 ? "neutro" : "erro";
  const porcentagem = situacao.total === 0 ? 0 : Math.min(100, (situacao.soma / situacao.total) * 100);

  return (
    <>
      <div className="interna-bloco">
        <div className="interna-bloco-topo">
          <span className="interna-bloco-titulo" id="interna-centos-titulo">
            Quantos centos?
          </span>
        </div>
        <div className="interna-quantidade" role="group" aria-labelledby="interna-centos-titulo">
          <Seletor
            rotulo="número de centos"
            valor={centos}
            podeMenos={centos > 1}
            podeMais={centos < MAX_CENTOS}
            aoMenos={() => mudarCentos(-1)}
            aoMais={() => mudarCentos(1)}
          />
          <span className="interna-quantidade-unidade">
            {centos === 1 ? "cento" : "centos"} · {situacao.total} unidades
          </span>
        </div>
      </div>

      {umSabor ? (
        <div className="interna-composicao">
          <div className="interna-composicao-topo">
            <span className="interna-bloco-titulo">Sabor</span>
            <span className="interna-bloco-dica">
              As {situacao.total} unidades são de <strong>{sabores[0]}</strong>.
            </span>
          </div>
        </div>
      ) : (
        <div className="interna-composicao">
          <div className="interna-composicao-topo">
            <span className="interna-bloco-titulo" id="interna-sabores-titulo">
              Monte a sua combinação
            </span>
            <span className="interna-bloco-dica">
              Distribua as {situacao.total} unidades entre os sabores, de {PASSO_SABOR} em {PASSO_SABOR}. Pode dividir como quiser.
            </span>
          </div>
          <ul className="interna-sabores" aria-labelledby="interna-sabores-titulo">
            {sabores.map((sabor) => (
              <li key={sabor} className="interna-sabor" data-zerado={atual[sabor] === 0}>
                <span className="interna-sabor-nome">{sabor}</span>
                <Seletor
                  rotulo={sabor}
                  valor={atual[sabor]}
                  apagado={atual[sabor] === 0}
                  podeMenos={atual[sabor] > 0}
                  podeMais={podeAumentar(atual, sabor, centos)}
                  aoMenos={() => mudarSabor(sabor, -1)}
                  aoMais={() => mudarSabor(sabor, 1)}
                />
              </li>
            ))}
          </ul>
          <div className="interna-progresso" data-cor={cor} aria-live="polite">
            <div className="interna-progresso-linha">
              <span className="interna-progresso-total">
                <Icon name={cor === "ok" ? "check_circle" : cor === "erro" ? "error" : "pie_chart"} size={22} tone="inherit" />
                {situacao.soma} de {situacao.total} selecionados
              </span>
              <span className="interna-progresso-falta">
                {situacao.completa
                  ? "Pode adicionar ao pedido"
                  : situacao.sobra > 0
                    ? `Passou ${situacao.sobra} unidades`
                    : `Faltam ${situacao.falta} unidades`}
              </span>
            </div>
            <div className="interna-progresso-barra" aria-hidden="true">
              <div style={{ width: `${porcentagem}%` }} />
            </div>
          </div>
        </div>
      )}

      <Observacao
        id="interna-observacao"
        valor={observacao}
        aoMudar={(t) => {
          setObservacao(t);
          setAdicionado(false);
        }}
        exemplo="Ex.: sem cebola no risole, entregar já montado na bandeja..."
      />

      <PainelAdicionar
        subtotal={centos * preco}
        detalhe={`${textoCentos(centos)} × ${formatMoeda(preco)}`}
        podeAdicionar={valida}
        erro={valida ? null : erro}
        adicionado={adicionado}
        aoAdicionar={aoAdicionar}
        indo={indo}
        rotulo={emEdicao ? ROTULO_SALVAR : ROTULO_ADICIONAR}
        rotuloBarra={emEdicao ? "Salvar" : "Adicionar"}
        mensagemAdicionado={virouNovo ? AVISO_VIROU_ITEM_NOVO : undefined}
      />
    </>
  );
}
