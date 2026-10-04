// Lista única das categorias de produto. Espelha o enum categoria_produto
// do banco (Kits entrou em supabase/categoria-kits.sql, Bento Cake em
// supabase/categoria-bento-cake.sql, Adicionais em
// supabase/categoria-adicionais.sql); scripts/banco/categoria.mjs falha se
// o enum e esta lista divergirem.
//
// A ordem do array é a ordem de exibição: chips da Lista, select e chips do
// admin, categorias do sitemap. A ordem do enum no banco não importa
// (nenhuma consulta ordena por categoria).
//
// - parametro: valor de ?categoria= na Lista (ROTAS.listaPorCategoria).
//   Fixo aqui, não calculado: mudar quebra links compartilhados.
// - entraEmMaisPedidos: false tira a categoria de "Os mais pedidos" (Home),
//   do bloco de destaques e do selo "Mais pedido" (Lista e interna) e de
//   "Combina com o seu pedido". As ofertas do checkout não olham isso.
export const CATEGORIAS = [
  { valor: "Bolos", rotulo: "Bolos", parametro: "bolos", entraEmMaisPedidos: true },
  { valor: "Bento Cake", rotulo: "Bento Cake", parametro: "bento-cake", entraEmMaisPedidos: true },
  { valor: "Doces", rotulo: "Doces", parametro: "doces", entraEmMaisPedidos: true },
  { valor: "Salgados", rotulo: "Salgados", parametro: "salgados", entraEmMaisPedidos: true },
  { valor: "Bebidas", rotulo: "Bebidas", parametro: "bebidas", entraEmMaisPedidos: false },
  { valor: "Kits", rotulo: "Kits", parametro: "kits", entraEmMaisPedidos: true },
  { valor: "Adicionais", rotulo: "Adicionais", parametro: "adicionais", entraEmMaisPedidos: false },
] as const;

export type Categoria = (typeof CATEGORIAS)[number];
export type CategoriaProduto = Categoria["valor"];

export const CATEGORIA_VALUES: readonly CategoriaProduto[] = CATEGORIAS.map((c) => c.valor);

// Registro de um valor vindo do banco. Valor desconhecido (por exemplo, um
// valor novo do enum que o código ainda não conhece) devolve undefined:
// quem chama decide o padrão, nunca lança erro.
export function categoriaDoValor(valor: string | null | undefined): Categoria | undefined {
  return CATEGORIAS.find((c) => c.valor === valor);
}
