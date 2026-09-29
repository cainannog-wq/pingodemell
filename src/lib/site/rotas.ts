// Rotas do site público. As próximas páginas (Lista, interna do produto,
// Quem Somos) devem usar exatamente estes caminhos.

import type { CategoriaProduto } from "@/lib/produtos/types";

// Valor do filtro na URL da Lista: a categoria do banco em minúsculas e
// com hífen no lugar do espaço (Bolos → bolos, Bento Cake → bento-cake).
// Não é slug de produto, é só o nome da categoria.
export function categoriaParaParametro(categoria: CategoriaProduto): string {
  return categoria.toLowerCase().replace(/\s+/g, "-");
}

export const ROTAS = {
  home: "/",
  lista: "/produtos",
  listaPorCategoria: (categoria: CategoriaProduto) =>
    `/produtos?categoria=${categoriaParaParametro(categoria)}`,
  // Interna do produto pelo slug (produtos.slug): gerado pelo banco a partir
  // do nome no cadastro e fixo depois, mesmo que o produto seja renomeado.
  // Nunca pelo nome nem pelo id.
  produto: (slug: string) => `/produtos/${slug}`,
  carrinho: "/carrinho",
  // Reservada pra página 5 (Checkout): o botão "Finalizar pedido" do carrinho
  // já aponta pra cá e cai na 404 até a página existir (item 6).
  checkout: "/checkout",
  quemSomos: "/quem-somos",
  contato: "/quem-somos#contato",
  prazos: "/#prazos",
  privacidade: "/politica-de-privacidade",
} as const;
