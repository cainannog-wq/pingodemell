import type { ProdutoVitrine } from "./mais-pedidos";
import { unidadeDeVenda } from "./unidade";

// Pedido mínimo e quantidade na unidade de venda, como aparecem na
// interna, nos cards da Home e da Lista, no carrinho, no checkout e no
// subtotal. Função pura coberta por teste.
//
// Regra: o mínimo só aparece quando pedido_minimo > 1 (mínimo 1 não diz
// nada), com ou sem unidade preenchida. O Cento nunca mostra pedido_minimo:
// conta em número de centos, sempre a partir de 1.
//
// Singular e plural saem da lista única (src/lib/vitrine/unidade.ts), sem o
// artigo do valor guardado: "10 kits", "2 caixas", "2 kg". Unidade vazia ou
// fora da lista: só o número.

// Nome da unidade para a quantidade: "unidades", "kit", "kg"; null sem
// unidade ou com unidade fora da lista.
export function nomeDaUnidade(quantidade: number, unidadeVenda: string | null): string | null {
  const unidade = unidadeDeVenda(unidadeVenda);
  if (!unidade) return null;
  return quantidade === 1 ? unidade.singular : unidade.plural;
}

// "10 unidades", "1 kg", "10 kits", "10" (sem unidade ou fora da lista).
export function textoQuantidadeNaUnidade(quantidade: number, unidadeVenda: string | null): string {
  const nome = nomeDaUnidade(quantidade, unidadeVenda);
  return nome ? `${quantidade} ${nome}` : String(quantidade);
}

// "mín. 10 kits", "mín. 30 unidades", "mín. 2 kg", "mín. 10" (sem unidade).
// Vale para o card e para o carrinho.
export function textoMinimoDaQuantidade(minimo: number, unidadeVenda: string | null): string {
  return `mín. ${textoQuantidadeNaUnidade(minimo, unidadeVenda)}`;
}

type ProdutoMinimo = Pick<ProdutoVitrine, "tipo" | "pedido_minimo" | "unidade_venda">;

// O Cento conta em centos e o Bolo em kg (de 1 kg, sem o mínimo do
// cadastro): nenhum dos dois usa pedido_minimo.
export function temMinimo(produto: ProdutoMinimo): boolean {
  return produto.tipo !== "cento" && produto.tipo !== "bolo" && Number(produto.pedido_minimo) > 1;
}

// Interna: "Pedido mínimo: 10 kits". null quando não mostra.
export function textoMinimo(produto: ProdutoMinimo): string | null {
  if (!temMinimo(produto)) return null;
  return `Pedido mínimo: ${textoQuantidadeNaUnidade(produto.pedido_minimo, produto.unidade_venda)}`;
}

// Card (Home e Lista): "mín. 30 unidades", "mín. 10 kits", "mín. 2 kg",
// "mín. 10" (sem unidade). null quando não mostra.
export function textoMinimoCurto(produto: ProdutoMinimo): string | null {
  if (!temMinimo(produto)) return null;
  return textoMinimoDaQuantidade(produto.pedido_minimo, produto.unidade_venda);
}
