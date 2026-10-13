// Rotas do site público. As próximas páginas (Lista, interna do produto,
// Quem Somos) devem usar exatamente estes caminhos.

import { categoriaDoValor, type CategoriaProduto } from "@/lib/produtos/categorias";

// Valor do filtro na URL da Lista: o `parametro` da lista única
// (Bolos → bolos, Bento Cake → bento-cake, Adicionais → adicionais).
// Não é slug de produto, é só o nome da categoria. Valor que a lista não
// conhece (vindo do banco antes de o código conhecê-lo) cai na regra antiga,
// minúsculas com hífen no lugar do espaço, sem erro: a Lista lê esse valor
// como "Todos".
export function categoriaParaParametro(categoria: CategoriaProduto): string {
  return categoriaDoValor(categoria)?.parametro ?? String(categoria).toLowerCase().replace(/\s+/g, "-");
}

// Endereço da Lista com filtro, busca, ordem e página (PR
// lista/busca-ordem-paginacao). Valor padrão não entra na URL ("Todos",
// busca vazia, Recomendados, página 1), então /produtos continua sendo a
// Lista sem nada escolhido. Ordem fixa dos parâmetros: categoria,
// subcategoria, busca, ordem, pagina. A subcategoria só vai com categoria
// (sem ela o parâmetro não vale).
export function urlDaLista({
  categoria = null,
  subcategoria = null,
  busca = "",
  ordem = "recomendados",
  pagina = 1,
}: {
  categoria?: CategoriaProduto | null;
  subcategoria?: string | null;
  busca?: string;
  ordem?: string;
  pagina?: number;
}): string {
  const p = new URLSearchParams();
  if (categoria) p.set("categoria", categoriaParaParametro(categoria));
  if (categoria && subcategoria?.trim()) p.set("subcategoria", subcategoria.trim());
  if (busca.trim()) p.set("busca", busca.trim());
  if (ordem !== "recomendados") p.set("ordem", ordem);
  if (pagina > 1) p.set("pagina", String(pagina));
  const query = p.toString();
  return query ? `/produtos?${query}` : "/produtos";
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
  // Página 5 (Checkout), item 6: dados do pedido, data e hora.
  checkout: "/checkout",
  // Página 6 (Confirmação): depois que o servidor grava o pedido, o botão
  // que abre o WhatsApp com a mensagem pronta.
  confirmacao: "/confirmacao",
  quemSomos: "/quem-somos",
  contato: "/quem-somos#contato",
  prazos: "/#prazos",
  privacidade: "/politica-de-privacidade",
} as const;
