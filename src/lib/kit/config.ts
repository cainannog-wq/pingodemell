// Configuração de um Kit Festa por pessoa (tipo kit_pessoa), montada a partir
// das tabelas kit_* (supabase/kit-pessoa-schema.sql). Regras puras: nada aqui
// acessa o banco. A tela, o carrinho e o servidor leem a MESMA estrutura, para
// ninguém decidir à parte o que é um tamanho disponível ou uma quantidade.

export type ModoGrupo = "escolha_unica" | "distribuicao" | "fixo";

export type KitOpcao = { id: string; nome: string; descricao: string | null; ativo: boolean };

// Uma linha de kit_quantidades de um grupo num tamanho. opcaoId nulo: vale
// para o grupo todo (distribuição, fixo, ou escolha única sem variação por
// opção). Com opcaoId: a quantidade daquela opção (a bebida do Básico).
export type KitQuantidade = { opcaoId: string | null; total: number; maxSabores: number | null; rotulo: string | null };

export type KitGrupo = {
  id: string;
  chave: string;
  rotulo: string;
  modo: ModoGrupo;
  passo: number | null;
  posicao: number;
  // Todas as opções da lista do grupo, ativas ou não (a tela só mostra as
  // ativas; o servidor também reconhece as inativas, que podem estar num
  // carrinho antigo).
  opcoes: KitOpcao[];
  porTamanho: Record<number, KitQuantidade[]>;
};

export type KitTamanho = { pessoas: number; boloKg: number; descartaveis: boolean };

export type KitConfig = { produtoId: string; tamanhos: KitTamanho[]; grupos: KitGrupo[] };

// Linhas cruas, como saem das tabelas.
export type LinhasDoKit = {
  tamanhos: { pessoas: number; bolo_kg: number | string; descartaveis: boolean }[];
  grupos: { id: string; chave: string; rotulo: string; modo: string; lista_id: string | null; passo: number | null; posicao: number }[];
  itens: { id: string; lista_id: string; nome: string; descricao: string | null; posicao: number; ativo: boolean }[];
  quantidades: {
    pessoas: number;
    grupo_id: string;
    opcao_id: string | null;
    total: number;
    max_sabores: number | null;
    rotulo: string | null;
  }[];
};

const MODOS: readonly string[] = ["escolha_unica", "distribuicao", "fixo"];

export function montarConfigKit(produtoId: string, linhas: LinhasDoKit): KitConfig {
  const grupos: KitGrupo[] = linhas.grupos
    .filter((g) => MODOS.includes(g.modo))
    .map((g) => {
      const porTamanho: Record<number, KitQuantidade[]> = {};
      for (const q of linhas.quantidades.filter((x) => x.grupo_id === g.id)) {
        (porTamanho[q.pessoas] ??= []).push({ opcaoId: q.opcao_id, total: q.total, maxSabores: q.max_sabores, rotulo: q.rotulo });
      }
      return {
        id: g.id,
        chave: g.chave,
        rotulo: g.rotulo,
        modo: g.modo as ModoGrupo,
        passo: g.passo,
        posicao: g.posicao,
        opcoes: g.lista_id
          ? linhas.itens
              .filter((i) => i.lista_id === g.lista_id)
              .sort((a, b) => a.posicao - b.posicao)
              .map((i) => ({ id: i.id, nome: i.nome, descricao: i.descricao, ativo: i.ativo }))
          : [],
        porTamanho,
      };
    })
    .sort((a, b) => a.posicao - b.posicao);
  const tamanhos = linhas.tamanhos
    .map((t) => ({ pessoas: Number(t.pessoas), boloKg: Number(t.bolo_kg), descartaveis: t.descartaveis }))
    .sort((a, b) => a.pessoas - b.pessoas);
  return { produtoId, tamanhos, grupos };
}

// Opções que a cliente pode escolher num grupo de escolha única, neste
// tamanho, com a quantidade de cada uma. Linha por opção: só as opções com
// linha (e ativas). Linha sem opção: todas as ativas, com a mesma quantidade.
export type OpcaoDeEscolha = { opcao: KitOpcao; total: number; rotulo: string | null };

export function opcoesDeEscolha(grupo: KitGrupo, pessoas: number): OpcaoDeEscolha[] {
  const linhas = grupo.porTamanho[pessoas] ?? [];
  const ativas = grupo.opcoes.filter((o) => o.ativo);
  const porOpcao = linhas.filter((l) => l.opcaoId !== null);
  if (porOpcao.length > 0) {
    return porOpcao.flatMap((l) => {
      const opcao = ativas.find((o) => o.id === l.opcaoId);
      return opcao ? [{ opcao, total: l.total, rotulo: l.rotulo }] : [];
    });
  }
  const geral = linhas.find((l) => l.opcaoId === null);
  return geral ? ativas.map((opcao) => ({ opcao, total: geral.total, rotulo: geral.rotulo })) : [];
}

// A linha geral de um grupo (distribuição ou fixo) neste tamanho.
export function linhaGeral(grupo: KitGrupo, pessoas: number): KitQuantidade | null {
  return (grupo.porTamanho[pessoas] ?? []).find((l) => l.opcaoId === null) ?? null;
}

// Um tamanho só está disponível se todo grupo tem o que a cliente precisa
// para fechar a composição: distribuição e fixo com a linha geral (e opções
// ativas para distribuir), escolha única com pelo menos uma opção.
export function tamanhoCompleto(config: KitConfig, pessoas: number): boolean {
  if (config.grupos.length === 0) return false;
  return config.grupos.every((g) => {
    if (g.modo === "fixo") return linhaGeral(g, pessoas) !== null;
    if (g.modo === "distribuicao") return linhaGeral(g, pessoas) !== null && g.opcoes.some((o) => o.ativo);
    return opcoesDeEscolha(g, pessoas).length > 0;
  });
}

export function tamanhosDisponiveis(config: KitConfig): KitTamanho[] {
  return config.tamanhos.filter((t) => tamanhoCompleto(config, t.pessoas));
}

// Kit sem nenhum tamanho completo é indisponível (some da vitrine e a interna
// dá 404), como o Cento sem sabor ativo.
export function kitDisponivel(config: KitConfig | null): boolean {
  return config !== null && tamanhosDisponiveis(config).length > 0;
}

// Menor número de pessoas que a cliente consegue fechar (o "a partir de" do
// preço); nulo se o kit não tem nenhum tamanho completo.
export function menorTamanhoDisponivel(config: KitConfig | null): number | null {
  if (!config) return null;
  return tamanhosDisponiveis(config)[0]?.pessoas ?? null;
}
