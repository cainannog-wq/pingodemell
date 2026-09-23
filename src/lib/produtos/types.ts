export const STEP_QUANTIDADE_VALUES = ["livre", "multiplos_5", "multiplos_10"] as const;
export type StepQuantidade = (typeof STEP_QUANTIDADE_VALUES)[number];

export const STEP_QUANTIDADE_LABELS: Record<StepQuantidade, string> = {
  livre: "Livre",
  multiplos_5: "Múltiplos de 5",
  multiplos_10: "Múltiplos de 10",
};

export const CATEGORIA_VALUES = ["Bolos", "Doces", "Salgados", "Bebidas"] as const;
export type CategoriaProduto = (typeof CATEGORIA_VALUES)[number];

export const TIPO_PRODUTO_VALUES = ["normal", "cento"] as const;
export type TipoProduto = (typeof TIPO_PRODUTO_VALUES)[number];

export const TIPO_PRODUTO_LABELS: Record<TipoProduto, string> = {
  normal: "Normal",
  cento: "Cento (com subitens)",
};

export type Produto = {
  nome: string;
  preco: number;
  descricao: string | null;
  image_url: string | null;
  criado_em: string | null;
  pedido_minimo: number;
  // Nome de coluna com "C" maiúsculo por já existir assim no banco antes
  // deste trabalho (criada fora deste repositório).
  Categoria: CategoriaProduto | null;
  prazo_producao_dias: number;
  step_quantidade: StepQuantidade;
  destaque: boolean;
  ativo: boolean;
  tipo: TipoProduto;
};

// Linha da tabela produto_cento_itens: um subitem (sabor) de um produto
// tipo "cento", referenciando outro produto real do catálogo.
export type ProdutoCentoItem = {
  id: string;
  cento_nome: string;
  subitem_nome: string;
  ordem: number;
};
