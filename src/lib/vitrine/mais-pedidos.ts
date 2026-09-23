import { formatMoeda } from "@/lib/pedidos/format";
import type { CategoriaProduto, TipoProduto } from "@/lib/produtos/types";

// Produto como a vitrine pública enxerga: só os campos que o site mostra
// ou usa pra filtrar/ordenar. Referência sempre pelo `id` (uuid), nunca
// pelo nome, que o admin pode trocar.
export type ProdutoVitrine = {
  id: string;
  nome: string;
  descricao: string | null;
  preco: number;
  image_url: string | null;
  Categoria: CategoriaProduto | null;
  tipo: TipoProduto;
  ativo: boolean;
  destaque: boolean;
  atualizado_em: string;
};

export const CAMPOS_VITRINE =
  "id, nome, descricao, preco, image_url, Categoria, tipo, ativo, destaque, atualizado_em";

export const LIMITE_MAIS_PEDIDOS = 10;

// Produto que conta como "mais pedido": destaque ligado, fora bebida
// (produto sem categoria conta como não bebida). Vale para a Home e para
// o bloco de destaques do topo da Lista.
export function ehMaisPedido(produto: Pick<ProdutoVitrine, "destaque" | "Categoria">): boolean {
  return produto.destaque === true && produto.Categoria !== "Bebidas";
}

// Regra de "Os mais pedidos" da Home:
// - só ativo E destaque (inativo não aparece em hipótese alguma);
// - fora a categoria Bebidas (produto sem categoria conta como não bebida);
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

// Preço como aparece no card: cento ganha "o cento"; o resto, só o valor,
// sem unidade (o banco não tem campo de unidade).
export function formatarPrecoVitrine(produto: Pick<ProdutoVitrine, "preco" | "tipo">): string {
  const valor = formatMoeda(Number(produto.preco));
  return produto.tipo === "cento" ? `${valor} o cento` : valor;
}
