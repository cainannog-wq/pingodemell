import { formatMoeda } from "@/lib/pedidos/format";
import { categoriaDoValor } from "@/lib/produtos/categorias";
import type { CategoriaProduto, StepQuantidade, TipoProduto } from "@/lib/produtos/types";
import { unidadeDeVenda } from "./unidade";

// Produto como a vitrine pública enxerga: só os campos que o site mostra
// ou usa pra filtrar/ordenar. Referência interna sempre pelo `id` (uuid);
// na URL, pelo `slug`. Nunca pelo nome, que o admin pode trocar.
export type ProdutoVitrine = {
  id: string;
  // Gerado e travado no banco (supabase/produtos-slug.sql). Opcional no
  // banco até a etapa 2 da migração; produto sem slug leva para a Lista.
  slug: string | null;
  nome: string;
  descricao: string | null;
  preco: number;
  image_url: string | null;
  Categoria: CategoriaProduto | null;
  tipo: TipoProduto;
  // Unidade do preço ("kg", "unidade"...), texto livre; null = só o valor.
  unidade_venda: string | null;
  // Quantidade: mínimo e incremento do seletor da interna (produto avulso;
  // o Cento ignora os dois e conta em número de centos).
  pedido_minimo: number;
  step_quantidade: StepQuantidade;
  ativo: boolean;
  destaque: boolean;
  atualizado_em: string;
  // Só do Bolo (tipo "bolo"), preenchido pela vitrine: menor R$/kg entre os
  // recheios ativos. O campo Preço do cadastro não vale para o Bolo.
  preco_a_partir_de?: number | null;
  // Só a Lista usa (filtro por subcategoria); lido junto dos sabores
  // (CAMPOS_COM_SABORES), não em CAMPOS_VITRINE.
  subcategoria_id?: string | null;
};

export const CAMPOS_VITRINE =
  "id, slug, nome, descricao, preco, image_url, Categoria, tipo, unidade_venda, pedido_minimo, step_quantidade, ativo, destaque, atualizado_em";

export const LIMITE_MAIS_PEDIDOS = 10;

// Produto que conta como "mais pedido": destaque ligado, fora as
// categorias com entraEmMaisPedidos falso na lista única (Bebidas e
// Adicionais). Produto sem categoria, ou com valor que a lista não conhece,
// conta como as demais. Vale para a Home, para o bloco de destaques do topo
// da Lista, para o selo da interna e para "Combina com o seu pedido".
export function ehMaisPedido(produto: Pick<ProdutoVitrine, "destaque" | "Categoria">): boolean {
  return produto.destaque === true && categoriaDoValor(produto.Categoria)?.entraEmMaisPedidos !== false;
}

// Regra de "Os mais pedidos" da Home:
// - só ativo E destaque (inativo não aparece em hipótese alguma);
// - fora Bebidas e Adicionais (ehMaisPedido);
// - do editado mais recentemente pro mais antigo (atualizado_em), com
//   desempate pelo nome;
// - no máximo 10.
export function selecionarMaisPedidos(produtos: ProdutoVitrine[]): ProdutoVitrine[] {
  return produtos
    .filter((p) => p.ativo === true && ehMaisPedido(p))
    .sort((a, b) => {
      const porData = Date.parse(b.atualizado_em) - Date.parse(a.atualizado_em);
      if (porData !== 0) return porData;
      return a.nome.localeCompare(b.nome, "pt-BR");
    })
    .slice(0, LIMITE_MAIS_PEDIDOS);
}

// "Combina com o seu pedido" (interna): sai da lista de "Os mais pedidos"
// (já sem bebida, sem inativo e sem Cento indisponível), tirando o produto
// que está na tela; mesma ordem, no máximo 3 (a grade do layout).
export const LIMITE_RELACIONADOS = 3;

export function selecionarRelacionados(maisPedidos: ProdutoVitrine[], produtoAtualId: string): ProdutoVitrine[] {
  return maisPedidos.filter((p) => p.id !== produtoAtualId && ehMaisPedido(p)).slice(0, LIMITE_RELACIONADOS);
}

// Unidade do preço ("a unidade", "a caixa", "o kit", "o kg"), da lista única
// (src/lib/vitrine/unidade.ts), nunca com "por". Vazio ou fora da lista: só
// o valor. Produto tipo cento é sempre "o cento" e Bolo "o kg", com ou sem
// unidade.
export function textoUnidadeVenda(produto: Pick<ProdutoVitrine, "tipo" | "unidade_venda">): string | null {
  if (produto.tipo === "cento") return "o cento";
  if (produto.tipo === "bolo") return "o kg";
  const unidade = unidadeDeVenda(produto.unidade_venda);
  // Bento Cake tem peso fechado: o preço é do bolinho inteiro. Só o combo
  // (bolinho com doces) mostra a unidade; o simples, nenhuma.
  if (produto.tipo === "bento_cake") return unidade?.chave === "combo" ? unidade.preco : null;
  return unidade?.preco ?? null;
}

// Preço como aparece no card: valor mais a unidade de venda (sem unidade,
// só o valor). Separado em partes pro card poder manter o valor inteiro
// numa linha e descer só a unidade.
type PrecoDoProduto = Pick<ProdutoVitrine, "preco" | "tipo" | "unidade_venda" | "preco_a_partir_de">;

export function partesPrecoVitrine(produto: PrecoDoProduto): {
  // "a partir de", só no Bolo (o preço depende do recheio escolhido).
  prefixo: string | null;
  valor: string;
  unidade: string | null;
} {
  if (produto.tipo === "bolo") {
    const a = produto.preco_a_partir_de;
    if (typeof a !== "number") return { prefixo: null, valor: "Sob consulta", unidade: null };
    return { prefixo: "A partir de", valor: formatMoeda(a), unidade: textoUnidadeVenda(produto) };
  }
  // Kit Festa por pessoa: "A partir de R$ 220,00" (menor tamanho x preço por
  // pessoa), sem unidade. Sem o valor calculado, cai no preço por pessoa.
  if (produto.tipo === "kit_pessoa" && typeof produto.preco_a_partir_de === "number") {
    return { prefixo: "A partir de", valor: formatMoeda(produto.preco_a_partir_de), unidade: null };
  }
  return {
    prefixo: null,
    valor: formatMoeda(Number(produto.preco)),
    unidade: textoUnidadeVenda(produto),
  };
}

export function formatarPrecoVitrine(produto: PrecoDoProduto): string {
  const { prefixo, valor, unidade } = partesPrecoVitrine(produto);
  return [prefixo, valor, unidade].filter(Boolean).join(" ");
}
