import type { ProdutoVitrine } from "./mais-pedidos";

// Pedido mínimo e quantidade na unidade de venda, como aparecem na
// interna, nos cards da Home e da Lista e no subtotal. Função pura coberta
// por teste.
//
// Regra: o mínimo só aparece quando pedido_minimo > 1 (mínimo 1 não diz
// nada), com ou sem unidade preenchida. O Cento nunca mostra pedido_minimo:
// conta em número de centos, sempre a partir de 1.

type Unidade = { singular: string; plural: string; curta: string };

// As 4 unidades sugeridas no cadastro, com plural. Outro texto aparece
// como foi digitado; vazio, só o número.
const UNIDADES: Record<string, Unidade> = {
  kg: { singular: "kg", plural: "kg", curta: "kg" },
  unidade: { singular: "unidade", plural: "unidades", curta: "un" },
  litro: { singular: "litro", plural: "litros", curta: "L" },
  cento: { singular: "cento", plural: "centos", curta: "centos" },
};

function unidadeDe(unidadeVenda: string | null): { conhecida: Unidade | null; texto: string | null } {
  const texto = unidadeVenda?.trim() || null;
  if (!texto) return { conhecida: null, texto: null };
  return { conhecida: UNIDADES[texto.toLowerCase()] ?? null, texto };
}

// Nome da unidade para a quantidade: "unidades", "kg", "litro", "caixa com
// 6" (texto livre como foi digitado); null sem unidade.
export function nomeDaUnidade(quantidade: number, unidadeVenda: string | null): string | null {
  const { conhecida, texto } = unidadeDe(unidadeVenda);
  if (conhecida) return quantidade === 1 ? conhecida.singular : conhecida.plural;
  return texto;
}

// "10 unidades", "1 kg", "2 litros", "3 caixa com 6", "10" (sem unidade).
export function textoQuantidadeNaUnidade(quantidade: number, unidadeVenda: string | null): string {
  const nome = nomeDaUnidade(quantidade, unidadeVenda);
  return nome ? `${quantidade} ${nome}` : String(quantidade);
}

type ProdutoMinimo = Pick<ProdutoVitrine, "tipo" | "pedido_minimo" | "unidade_venda">;

export function temMinimo(produto: ProdutoMinimo): boolean {
  return produto.tipo !== "cento" && Number(produto.pedido_minimo) > 1;
}

// Interna: "Pedido mínimo: 10 unidades". null quando não mostra.
export function textoMinimo(produto: ProdutoMinimo): string | null {
  if (!temMinimo(produto)) return null;
  return `Pedido mínimo: ${textoQuantidadeNaUnidade(produto.pedido_minimo, produto.unidade_venda)}`;
}

// Card (Home e Lista), curto como no layout: "mín. 10 un", "mín. 2 kg",
// "mín. 10" (sem unidade). null quando não mostra.
export function textoMinimoCurto(produto: ProdutoMinimo): string | null {
  if (!temMinimo(produto)) return null;
  const { conhecida, texto } = unidadeDe(produto.unidade_venda);
  const unidade = conhecida ? conhecida.curta : texto;
  return unidade ? `mín. ${produto.pedido_minimo} ${unidade}` : `mín. ${produto.pedido_minimo}`;
}
