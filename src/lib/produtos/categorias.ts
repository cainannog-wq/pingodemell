// Lista única das categorias de produto. Espelha o enum categoria_produto
// do banco (Kits entrou em supabase/categoria-kits.sql e foi renomeada para
// Kit Festa em supabase/categoria-kit-festa.sql, Bento Cake em
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
  { valor: "Kit Festa", rotulo: "Kit Festa", parametro: "kit-festa", entraEmMaisPedidos: true },
  { valor: "Adicionais", rotulo: "Adicionais", parametro: "adicionais", entraEmMaisPedidos: false },
] as const;

export type Categoria = (typeof CATEGORIAS)[number];
export type CategoriaProduto = Categoria["valor"];

export const CATEGORIA_VALUES: readonly CategoriaProduto[] = CATEGORIAS.map((c) => c.valor);

// Nomes antigos que o banco ainda pode devolver. O código aceita "Kits" e
// "Kit Festa" como a mesma categoria enquanto o RENAME do enum não é
// aplicado (e, se ele for desfeito, depois). Retirar "Kits" daqui é um PR
// futuro, só depois de o RENAME estar aplicado e estável.
const NOMES_ANTIGOS: Readonly<Record<string, CategoriaProduto>> = { Kits: "Kit Festa" };

// Nome atual de um valor vindo do banco: o próprio valor, ou o nome novo de
// um nome antigo. Valor desconhecido ou vazio devolve null.
export function categoriaCanonica(valor: string | null | undefined): CategoriaProduto | null {
  if (!valor) return null;
  if ((CATEGORIA_VALUES as readonly string[]).includes(valor)) return valor as CategoriaProduto;
  return NOMES_ANTIGOS[valor] ?? null;
}

// Registro de um valor vindo do banco. Valor desconhecido (por exemplo, um
// valor novo do enum que o código ainda não conhece) devolve undefined:
// quem chama decide o padrão, nunca lança erro.
export function categoriaDoValor(valor: string | null | undefined): Categoria | undefined {
  const canonica = categoriaCanonica(valor);
  return canonica ? CATEGORIAS.find((c) => c.valor === canonica) : undefined;
}
