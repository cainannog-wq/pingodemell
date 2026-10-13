import type { CategoriaProduto, TipoProduto } from "./types";

// Recheios personalizados por produto (supabase/produto-recheios.sql): lista
// de texto livre dentro do próprio produto, sem ligação com o catálogo
// public.recheios. O cliente escolhe um na interna; o preço é sempre o fixo
// do produto. Regras puras, usadas pelo admin (formulário e servidor) e pela
// vitrine.

export type RecheioDoProduto = { id: string; nome: string };

export const RECHEIO_PRODUTO_NOME_MAX = 100;
export const RECHEIOS_PRODUTO_MAX = 100;

// O interruptor existe só para Bolos de tipo normal (Ganache, Kit Kat... e o
// Smash Cake) e para a categoria Bento Cake. Nunca para o Bolo tradicional
// (tipo bolo, que usa o catálogo com preço por kg), para o Cento nem para
// outra categoria.
export function aceitaRecheiosPersonalizados(produto: {
  Categoria: CategoriaProduto | null | undefined;
  tipo: TipoProduto;
}): boolean {
  if (produto.Categoria === "Bolos") return produto.tipo === "normal";
  if (produto.Categoria === "Bento Cake") return produto.tipo === "bento_cake";
  return false;
}

// Chave de comparação: sem acento, sem maiúscula, espaços juntos.
export function chaveDoRecheio(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export type ListaDeRecheios =
  | { ok: true; recheios: { id?: string; nome: string }[] }
  | { ok: false; erro: string };

// Confere a lista do formulário (interruptor ligado). Lista vazia, campo em
// branco e recheio repetido (sem acento nem maiúscula) bloqueiam o Salvar.
export function validarRecheiosDoProduto(itens: { id?: string; nome: string }[]): ListaDeRecheios {
  if (itens.length === 0) {
    return { ok: false, erro: "Adicione pelo menos um recheio ou desligue os recheios personalizados." };
  }
  if (itens.length > RECHEIOS_PRODUTO_MAX) {
    return { ok: false, erro: `No máximo ${RECHEIOS_PRODUTO_MAX} recheios por produto.` };
  }
  const vistos = new Set<string>();
  const saida: { id?: string; nome: string }[] = [];
  for (const item of itens) {
    const nome = item.nome.trim().replace(/\s+/g, " ");
    if (!nome) return { ok: false, erro: "Há um recheio em branco. Preencha ou remova." };
    if (nome.length > RECHEIO_PRODUTO_NOME_MAX) {
      return { ok: false, erro: `Cada recheio tem no máximo ${RECHEIO_PRODUTO_NOME_MAX} caracteres.` };
    }
    const chave = chaveDoRecheio(nome);
    if (vistos.has(chave)) return { ok: false, erro: `O recheio “${nome}” está repetido.` };
    vistos.add(chave);
    saida.push(item.id ? { id: item.id, nome } : { nome });
  }
  return { ok: true, recheios: saida };
}
