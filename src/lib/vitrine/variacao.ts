import type { TipoProduto } from "@/lib/produtos/types";

// Qual tela e quais regras um produto tem. Só o `tipo` decide (a categoria
// é filtro): interna, cards, carrinho, disponibilidade na Home/Lista e
// formulário do admin perguntam aqui, em vez de comparar o tipo cada um por
// conta própria.
//
// Smash Cake não tem variação própria: é um produto "normal" (na categoria
// Bolos) e cai no avulso.

export type Variacao = "avulso" | "cento" | "bolo" | "bento";

const POR_TIPO: Record<TipoProduto, Variacao> = {
  normal: "avulso",
  cento: "cento",
  bolo: "bolo",
  bento_cake: "bento",
};

export function variacaoDoProduto(produto: { tipo: TipoProduto }): Variacao {
  return POR_TIPO[produto.tipo] ?? "avulso";
}
