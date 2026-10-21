// Listas de opções do Kit Festa por pessoa (kit_listas e kit_lista_itens,
// supabase/kit-pessoa-schema.sql). Regras puras do editor de listas
// (/admin/kit-listas): nada aqui acessa o banco.

export const NOME_ITEM_MAX = 100;
export const DESCRICAO_ITEM_MAX = 200;
export const POSICAO_MAX = 200;

export type ItemDaLista = {
  id: string;
  lista_id: string;
  nome: string;
  descricao: string | null;
  posicao: number;
  ativo: boolean;
};

export type Lista = { id: string; nome: string; itens: ItemDaLista[] };

export type Direcao = "subir" | "descer";

export type ResultadoParse<T> = { success: true; data: T } | { success: false; error: string };

// Espaços nas pontas saem e os repetidos viram um só, para o banco (nome sem
// espaço sobrando, de 1 a 100 caracteres) nunca ser quem recusa um nome comum.
export function parseNomeItem(bruto: unknown): ResultadoParse<string> {
  const nome = String(bruto ?? "").trim().replace(/\s+/g, " ");
  if (!nome) return { success: false, error: "Informe o nome da opção." };
  if (nome.length > NOME_ITEM_MAX) {
    return { success: false, error: `O nome da opção tem no máximo ${NOME_ITEM_MAX} caracteres.` };
  }
  return { success: true, data: nome };
}

// A descrição é opcional (por exemplo, "acréscimo a combinar no WhatsApp"):
// vazia vira nula.
export function parseDescricaoItem(bruto: unknown): ResultadoParse<string | null> {
  const descricao = String(bruto ?? "").trim().replace(/\s+/g, " ");
  if (!descricao) return { success: true, data: null };
  if (descricao.length > DESCRICAO_ITEM_MAX) {
    return { success: false, error: `A descrição tem no máximo ${DESCRICAO_ITEM_MAX} caracteres.` };
  }
  return { success: true, data: descricao };
}

export function ordenarItens<T extends { nome: string; posicao: number }>(itens: readonly T[]): T[] {
  return [...itens].sort((a, b) => a.posicao - b.posicao || a.nome.localeCompare(b.nome, "pt-BR"));
}

// Próxima posição livre (fim da lista), ou null se a lista já está cheia.
export function proximaPosicao(itens: readonly { posicao: number }[]): number | null {
  const proxima = itens.reduce((maior, i) => Math.max(maior, i.posicao), 0) + 1;
  return proxima > POSICAO_MAX ? null : proxima;
}

// Sobe ou desce um item uma posição e renumera a lista de 1 em 1. Devolve só
// as linhas cuja posição mudou, para um upsert único por id (a unicidade
// (lista_id, posicao) é conferida no fim da instrução, então a troca passa).
// Primeiro subindo, último descendo ou id desconhecido: null (nada a gravar).
export function planejarMovimento(
  itens: readonly ItemDaLista[],
  id: string,
  direcao: Direcao
): { id: string; lista_id: string; nome: string; posicao: number }[] | null {
  const fila = ordenarItens(itens);
  const i = fila.findIndex((l) => l.id === id);
  if (i < 0) return null;
  const j = direcao === "subir" ? i - 1 : i + 1;
  if (j < 0 || j >= fila.length) return null;
  const nova = [...fila];
  [nova[i], nova[j]] = [nova[j], nova[i]];
  const mudancas: { id: string; lista_id: string; nome: string; posicao: number }[] = [];
  nova.forEach((item, indice) => {
    const posicao = indice + 1;
    if (item.posicao !== posicao) mudancas.push({ id: item.id, lista_id: item.lista_id, nome: item.nome, posicao });
  });
  return mudancas;
}

type ErroBanco = { code?: string | null } | null | undefined;

// Nenhuma mensagem crua do banco chega à tela.
export function traduzirErroKit(erro: ErroBanco): string {
  switch (erro?.code) {
    case "23505":
      return "Já existe uma opção com esse nome nesta lista.";
    case "23514":
      return "Confira o nome (até 100 caracteres) e a descrição (até 200), sem espaço sobrando nas pontas.";
    case "42501":
      return "Você não tem permissão para fazer isso. Entre de novo e tente outra vez.";
    default:
      return "Não foi possível salvar agora. Tente de novo em instantes.";
  }
}
