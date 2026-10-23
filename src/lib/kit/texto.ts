import { linhaGeral, opcoesDeEscolha, type KitConfig } from "./config";
import type { FormatoBolo } from "@/lib/vitrine/bolo";
import type { EscolhasKit } from "./escolhas";

// Retrato legível de um kit montado: o que a cliente escolheu, com os nomes.
// O navegador o guarda na linha do carrinho (para exibir, montar a mensagem e
// a confirmação sem tocar no banco) e o servidor o remonta da configuração,
// com os nomes dele, para gravar no pedido. É só exibição: o preço nunca sai
// daqui (preço por pessoa × pessoas, na linha).

export type ItemDoRetrato = { id: string; nome: string; quantidade: number };

export type GrupoDoRetrato = {
  chave: string;
  rotulo: string;
  // Escolha única e distribuição: os itens escolhidos. Fixo: nenhum.
  itens: ItemDoRetrato[];
  // Fixo: o texto da linha da configuração (ex.: "Pratos e copos") e o total.
  fixo?: { rotulo: string | null; total: number };
};

export type RetratoDoKit = {
  pessoas: number;
  boloKg: number;
  // Redondo ou quadrado; ausente em retrato de antes do campo.
  formato?: FormatoBolo;
  descartaveis: boolean;
  grupos: GrupoDoRetrato[];
};

export const NOME_OPCAO_DESCONHECIDA = "opção não encontrada";

// "1,5 kg", "2 kg" (vírgula decimal, sem zero sobrando).
export function textoKg(kg: number): string {
  return `${String(kg).replace(".", ",")} kg`;
}

// Monta o retrato a partir da configuração e das escolhas. Opção que a
// configuração não conhece fica com NOME_OPCAO_DESCONHECIDA.
export function montarRetrato(config: KitConfig, pessoas: number, escolhas: EscolhasKit, formato?: FormatoBolo): RetratoDoKit {
  const tamanho = config.tamanhos.find((t) => t.pessoas === pessoas);
  return {
    pessoas,
    boloKg: tamanho?.boloKg ?? 0,
    ...(formato ? { formato } : {}),
    descartaveis: tamanho?.descartaveis ?? false,
    grupos: config.grupos.map((g) => {
      const base: GrupoDoRetrato = {
        chave: g.chave,
        rotulo: g.rotulo,
        itens: (escolhas[g.chave] ?? []).map(([id, quantidade]) => ({
          id,
          nome: g.opcoes.find((o) => o.id === id)?.nome ?? NOME_OPCAO_DESCONHECIDA,
          quantidade,
        })),
      };
      if (g.modo === "fixo") {
        const linha = linhaGeral(g, pessoas);
        if (linha) base.fixo = { rotulo: linha.rotulo, total: linha.total };
      }
      if (g.modo === "escolha_unica" && base.itens.length === 1) {
        const rotulo = opcoesDeEscolha(g, pessoas).find((o) => o.opcao.id === base.itens[0].id)?.rotulo;
        if (rotulo) base.fixo = { rotulo, total: base.itens[0].quantidade };
      }
      return base;
    }),
  };
}

function linhaDoGrupo(g: GrupoDoRetrato): string {
  if (g.itens.length === 0 && g.fixo) {
    return g.fixo.rotulo ? `${g.rotulo}: ${g.fixo.total} ${g.fixo.rotulo}` : `${g.rotulo}: ${g.fixo.total}`;
  }
  if (g.itens.length === 1 && g.fixo?.rotulo) {
    // Escolha única com rótulo por opção (ex.: "2 Cini 2L"): o rótulo diz tudo.
    return `${g.rotulo}: ${g.fixo.rotulo}`;
  }
  const itens = g.itens.map((i) => (i.quantidade === 1 && g.itens.length === 1 ? i.nome : `${i.nome} ${i.quantidade}`));
  return `${g.rotulo}: ${itens.join(", ")}`;
}

// Linhas da composição, sem emoji e sem hífen: tamanho, bolo, grupos e
// descartáveis. Usadas na mensagem, na confirmação e no painel.
export function linhasDaComposicao(r: RetratoDoKit): string[] {
  const linhas = [`Bolo: ${textoKg(r.boloKg)}${r.formato ? `, ${r.formato}` : ""}`];
  for (const g of r.grupos) linhas.push(linhaDoGrupo(g));
  if (r.descartaveis) linhas.push("Descartáveis incluídos");
  return linhas;
}

// Texto único (uma linha por item da composição), o que o servidor grava em
// `variacao` e o painel mostra com quebras de linha.
export function textoDaComposicao(r: RetratoDoKit): string {
  return linhasDaComposicao(r).join("\n");
}
