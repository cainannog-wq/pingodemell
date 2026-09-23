// Rotas do site público. As próximas páginas (Lista, interna do produto,
// Quem Somos) devem usar exatamente estes caminhos.

import type { CategoriaProduto } from "@/lib/produtos/types";

// Valor do filtro na URL da Lista: a categoria do banco em minúsculas
// (Bolos → bolos). Não é slug de produto, é só o nome da categoria.
export function categoriaParaParametro(categoria: CategoriaProduto): string {
  return categoria.toLowerCase();
}

export const ROTAS = {
  home: "/",
  lista: "/produtos",
  listaPorCategoria: (categoria: CategoriaProduto) =>
    `/produtos?categoria=${categoriaParaParametro(categoria)}`,
  // Interna do produto pelo id (uuid) — nunca pelo nome, que pode mudar.
  produto: (id: string) => `/produtos/${id}`,
  // Reservada pra página 4 (Carrinho): a sacola do cabeçalho já aponta pra
  // cá e cai na 404 até a página existir.
  carrinho: "/carrinho",
  quemSomos: "/quem-somos",
  contato: "/quem-somos#contato",
  prazos: "/#prazos",
  privacidade: "/politica-de-privacidade",
} as const;
