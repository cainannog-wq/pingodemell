"use client";

import { useState } from "react";
import { Icon } from "@/components/ds";
import { Seletor } from "@/components/site/Seletor";
import { useCarrinho } from "@/components/site/CarrinhoProvider";
import { contarKits, MAX_KITS, normalizarObservacao, TEXTO_LIMITE_DE_KITS } from "@/lib/carrinho/regras";
import { linhaGeral, opcoesDeEscolha, tamanhosDisponiveis, type KitConfig, type KitGrupo } from "@/lib/kit/config";
import { progressoDaDistribuicao, validarEscolhas, type EscolhasKit } from "@/lib/kit/escolhas";
import { montarRetrato, textoKg } from "@/lib/kit/texto";
import { formatMoeda } from "@/lib/pedidos/format";
import type { ProdutoVitrine } from "@/lib/vitrine/mais-pedidos";
import { useAdicionarEIrAoCarrinho } from "./edicao";
import { EscolhaRecheio } from "./EscolhaRecheio";
import { Observacao } from "./Observacao";
import { PainelAdicionar } from "./PainelAdicionar";

// Configuração do Kit Festa por pessoa (tipo kit_pessoa; regras puras em
// src/lib/kit/). As pessoas são a quantidade do produto e só valem os tamanhos
// da tabela do kit; o preço é por pessoa. Cada grupo da configuração é uma
// escolha única (recheio do bolo, bebida, com a quantidade de cada opção), uma
// distribuição em passos (doces, fritos, assados, sanduíches, com máximo de
// sabores) ou um texto fixo (descartáveis). O botão só liga com todos os
// grupos fechados; trocar as pessoas zera as distribuições (o total muda) e
// mantém a escolha única que ainda existe no novo tamanho.

function escolhasIniciais(config: KitConfig, pessoas: number, anteriores: EscolhasKit = {}): EscolhasKit {
  const saida: EscolhasKit = {};
  for (const g of config.grupos) {
    if (g.modo !== "escolha_unica") continue;
    const opcoes = opcoesDeEscolha(g, pessoas);
    const antes = anteriores[g.chave]?.[0]?.[0];
    const mantida = opcoes.find((o) => o.opcao.id === antes);
    const escolhida = mantida ?? (opcoes.length === 1 ? opcoes[0] : undefined);
    if (escolhida) saida[g.chave] = [[escolhida.opcao.id, escolhida.total]];
  }
  return saida;
}

function textoPessoas(n: number): string {
  return `${n} ${n === 1 ? "pessoa" : "pessoas"}`;
}

// previa: prévia do admin de um kit inativo (/previa/{slug}). Tudo funciona como
// para a cliente, menos o botão: um kit inativo não entra no pedido.
export const TEXTO_PREVIA = "Prévia do admin: este kit está inativo e não pode ser adicionado ao pedido.";

export function ConfigKit({ produto, config, previa = false }: { produto: ProdutoVitrine; config: KitConfig; previa?: boolean }) {
  const tamanhos = tamanhosDisponiveis(config);
  const { linhas } = useCarrinho();
  const { indo, adicionarEIr } = useAdicionarEIrAoCarrinho();
  const [pessoas, setPessoas] = useState(tamanhos[0]?.pessoas ?? 0);
  const [escolhas, setEscolhas] = useState<EscolhasKit>(() => escolhasIniciais(config, tamanhos[0]?.pessoas ?? 0));
  const [observacao, setObservacao] = useState("");
  const [adicionado, setAdicionado] = useState(false);
  const [avisoTroca, setAvisoTroca] = useState<string | null>(null);

  const preco = Number(produto.preco);
  const tamanho = tamanhos.find((t) => t.pessoas === pessoas);
  const resultado = validarEscolhas(config, pessoas, escolhas, "tela");
  const noLimite = contarKits(linhas) >= MAX_KITS;
  const valida = resultado.ok && !noLimite && tamanho !== undefined && !previa;
  const erro = previa
    ? TEXTO_PREVIA
    : noLimite
    ? TEXTO_LIMITE_DE_KITS
    : resultado.ok
      ? null
      : (resultado.problemas[0]?.mensagem ?? "Complete o kit para adicionar.");

  function mudar<T>(set: (v: T) => void) {
    return (v: T) => {
      set(v);
      setAdicionado(false);
    };
  }

  function trocarPessoas(novo: number) {
    if (novo === pessoas) return;
    const tinhaDistribuicao = config.grupos.some((g) => g.modo === "distribuicao" && (escolhas[g.chave]?.length ?? 0) > 0);
    setPessoas(novo);
    setEscolhas(escolhasIniciais(config, novo, escolhas));
    setAvisoTroca(
      tinhaDistribuicao
        ? `Você mudou para ${textoPessoas(novo)}: as quantidades mudam, então refaça a escolha dos itens que a gente zerou.`
        : null
    );
    setAdicionado(false);
  }

  function escolherUnica(grupo: KitGrupo, id: string) {
    const opcao = opcoesDeEscolha(grupo, pessoas).find((o) => o.opcao.id === id);
    if (!opcao) return;
    setEscolhas((e) => ({ ...e, [grupo.chave]: [[id, opcao.total]] }));
    setAdicionado(false);
  }

  // Quantidade de uma opção numa distribuição (0 = fora).
  function quantidadeDe(grupo: KitGrupo, id: string): number {
    return (escolhas[grupo.chave] ?? []).find(([i]) => i === id)?.[1] ?? 0;
  }

  function definirQuantidade(grupo: KitGrupo, id: string, quantidade: number) {
    setEscolhas((e) => {
      const outros = (e[grupo.chave] ?? []).filter(([i]) => i !== id);
      const pares: [string, number][] = quantidade > 0 ? [...outros, [id, quantidade]] : outros;
      // Mantém a ordem da lista para o texto da composição sair sempre igual.
      const ordem = new Map(grupo.opcoes.map((o, i) => [o.id, i]));
      pares.sort((a, b) => (ordem.get(a[0]) ?? 0) - (ordem.get(b[0]) ?? 0));
      return { ...e, [grupo.chave]: pares };
    });
    setAdicionado(false);
  }

  function aoAdicionar() {
    if (!valida || !resultado.ok || !tamanho) return;
    adicionarEIr({
      tipo: "kit",
      produtoId: produto.id,
      slug: produto.slug,
      nome: produto.nome,
      preco,
      quantidade: pessoas,
      unidade_venda: "a pessoa",
      escolhas,
      retrato: montarRetrato(config, pessoas, escolhas),
      foto: produto.image_url,
      observacao: normalizarObservacao(observacao),
    });
    setAdicionado(true);
  }

  function blocoDoGrupo(grupo: KitGrupo) {
    const geral = linhaGeral(grupo, pessoas);
    if (grupo.modo === "fixo") {
      if (!geral) return null;
      return (
        <div key={grupo.chave} className="interna-composicao">
          <div className="interna-composicao-topo">
            <span className="interna-bloco-titulo">{grupo.rotulo}</span>
            <span className="interna-bloco-dica">
              {geral.rotulo ? `${geral.total} ${geral.rotulo}` : `${geral.total}`}
            </span>
          </div>
        </div>
      );
    }

    if (grupo.modo === "escolha_unica") {
      const opcoes = opcoesDeEscolha(grupo, pessoas);
      return (
        <EscolhaRecheio
          key={grupo.chave}
          titulo={grupo.rotulo}
          dica="Escolha uma opção."
          nomeCampo={`interna-kit-${grupo.chave}`}
          valor={escolhas[grupo.chave]?.[0]?.[0] ?? null}
          aoEscolher={(id) => escolherUnica(grupo, id)}
          grupos={[
            {
              chave: grupo.chave,
              rotulo: null,
              opcoes: opcoes.map((o) => ({
                id: o.opcao.id,
                nome: o.opcao.nome,
                // O rótulo da quantidade (ex.: "2 Cini 2L") e a descrição da opção
                // (ex.: acréscimo a combinar no WhatsApp).
                detalhe: [o.rotulo, o.opcao.descricao].filter(Boolean).join(" · ") || undefined,
              })),
            },
          ]}
        />
      );
    }

    // Distribuição em passos.
    if (!geral) return null;
    const passo = grupo.passo ?? 1;
    const pares = escolhas[grupo.chave] ?? [];
    const progresso = progressoDaDistribuicao(grupo, pessoas, pares);
    const ativas = grupo.opcoes.filter((o) => o.ativo);
    const usadas = pares.length;
    const completa = progresso.falta === 0 && progresso.sobra === 0;
    const cor = completa ? "ok" : progresso.feitos === 0 ? "neutro" : "erro";
    const porcentagem = progresso.total === 0 ? 0 : Math.min(100, (progresso.feitos / progresso.total) * 100);
    const titulo = `interna-kit-${grupo.chave}-titulo`;
    return (
      <div key={grupo.chave} className="interna-composicao">
        <div className="interna-composicao-topo">
          <span className="interna-bloco-titulo" id={titulo}>
            {grupo.rotulo}
          </span>
          <span className="interna-bloco-dica">
            Distribua as {progresso.total} unidades, de {passo} em {passo}.
            {geral.maxSabores !== null ? ` No máximo ${geral.maxSabores} sabores.` : ""}
          </span>
        </div>
        <ul className="interna-sabores" aria-labelledby={titulo}>
          {ativas.map((opcao) => {
            const atual = quantidadeDe(grupo, opcao.id);
            const cheio = geral.maxSabores !== null && usadas >= geral.maxSabores && atual === 0;
            return (
              <li key={opcao.id} className="interna-sabor" data-zerado={atual === 0}>
                <span className="interna-sabor-nome">
                  {opcao.nome}
                  {opcao.descricao ? <span className="interna-opcao-detalhe"> {opcao.descricao}</span> : null}
                </span>
                <Seletor
                  rotulo={`${grupo.rotulo}, ${opcao.nome}`}
                  valor={atual}
                  apagado={atual === 0}
                  invalido={atual % passo !== 0}
                  podeMenos={atual > 0}
                  podeMais={!cheio && progresso.feitos + passo <= progresso.total}
                  aoMenos={() => definirQuantidade(grupo, opcao.id, Math.max(0, atual - passo))}
                  aoMais={() => definirQuantidade(grupo, opcao.id, atual + passo)}
                  aoDigitar={(t) => definirQuantidade(grupo, opcao.id, t === "" ? 0 : Math.min(Number(t), progresso.total))}
                  aoSairDoCampo={() => definirQuantidade(grupo, opcao.id, Math.floor(atual / passo) * passo)}
                />
              </li>
            );
          })}
        </ul>
        <div className="interna-progresso" data-cor={cor} aria-live="polite">
          <div className="interna-progresso-linha">
            <span className="interna-progresso-total">
              <Icon name={cor === "ok" ? "check_circle" : cor === "erro" ? "error" : "pie_chart"} size={22} tone="inherit" />
              {progresso.feitos} de {progresso.total} selecionados
            </span>
            <span className="interna-progresso-falta">
              {completa
                ? "Completo"
                : progresso.sobra > 0
                  ? `Passou ${progresso.sobra} unidades`
                  : `Faltam ${progresso.falta} unidades`}
            </span>
          </div>
          <div className="interna-progresso-barra" aria-hidden="true">
            <div style={{ width: `${porcentagem}%` }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <fieldset className="interna-bloco interna-formato">
        <legend className="interna-bloco-titulo">Para quantas pessoas?</legend>
        <div className="interna-formatos">
          {tamanhos.map((t) => (
            <label key={t.pessoas} className="interna-opcao interna-opcao-pilula" data-marcada={pessoas === t.pessoas}>
              <input
                type="radio"
                name="interna-kit-pessoas"
                value={t.pessoas}
                checked={pessoas === t.pessoas}
                onChange={() => trocarPessoas(t.pessoas)}
              />
              <span className="interna-opcao-nome">{textoPessoas(t.pessoas)}</span>
            </label>
          ))}
        </div>
        {tamanho ? (
          <p className="interna-bloco-dica">
            Bolo de {textoKg(tamanho.boloKg)}
            {tamanho.descartaveis ? ", com descartáveis incluídos" : ""}.
          </p>
        ) : null}
        {avisoTroca ? (
          <p className="interna-aviso" role="status">
            <Icon name="info" size={20} tone="inherit" />
            {avisoTroca}
          </p>
        ) : null}
      </fieldset>

      {config.grupos.map(blocoDoGrupo)}

      <Observacao
        id="interna-observacao"
        valor={observacao}
        aoMudar={mudar(setObservacao)}
        exemplo="Ex.: tema da festa, alergias, horário de retirada..."
      />

      <PainelAdicionar
        subtotal={pessoas * preco}
        detalhe={`${textoPessoas(pessoas)} × ${formatMoeda(preco)}`}
        podeAdicionar={valida}
        erro={valida ? null : erro}
        adicionado={adicionado}
        aoAdicionar={aoAdicionar}
        indo={indo}
      />
    </>
  );
}
