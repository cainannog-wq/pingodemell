import type { CategoriaProduto } from "./categorias";

export const STEP_QUANTIDADE_VALUES = ["livre", "multiplos_5", "multiplos_10"] as const;
export type StepQuantidade = (typeof STEP_QUANTIDADE_VALUES)[number];

export const STEP_QUANTIDADE_LABELS: Record<StepQuantidade, string> = {
  livre: "Livre",
  multiplos_5: "Múltiplos de 5",
  multiplos_10: "Múltiplos de 10",
};

// Categorias: lista única em ./categorias (valor, rótulo, ordem, valor na URL).
export { CATEGORIA_VALUES, type CategoriaProduto } from "./categorias";

// Comportamento do produto na interna, no carrinho e no cadastro. Espelha
// o enum produto_tipo do banco (bolo e bento_cake entraram em
// supabase/produto-tipo-bolo-bento.sql). A categoria é só filtro; quem
// decide a tela é o tipo (src/lib/vitrine/variacao.ts). Smash Cake não tem
// tipo: é um produto normal em Bolos.
export const TIPO_PRODUTO_VALUES = ["normal", "cento", "bolo", "bento_cake"] as const;
export type TipoProduto = (typeof TIPO_PRODUTO_VALUES)[number];

export const TIPO_PRODUTO_LABELS: Record<TipoProduto, string> = {
  normal: "Normal",
  cento: "Cento (com subitens)",
  bolo: "Bolo (recheio e tamanho em kg)",
  bento_cake: "Bento Cake (com recheio)",
};

// Categoria que cada tipo exige. O Bento Cake também é o único tipo aceito
// na categoria Bento Cake.
export const CATEGORIA_DO_TIPO: Partial<Record<TipoProduto, CategoriaProduto>> = {
  bolo: "Bolos",
  bento_cake: "Bento Cake",
};

// Unidades sugeridas no campo "Unidade de venda" do cadastro. O banco
// aceita outro texto: unidade_venda é texto livre, não enum, pra não
// precisar mudar o banco a cada unidade nova do catálogo.
export const UNIDADES_VENDA_SUGERIDAS = ["kg", "unidade", "cento", "litro"] as const;
export const UNIDADE_VENDA_MAX = 20;

export type Produto = {
  // Identificador estável (uuid, único). A chave primária continua sendo o
  // nome; é o id que as fotos extras (produto_fotos) referenciam.
  id: string;
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
  // Unidade em que o preço é dado ("kg", "unidade"...), texto livre e
  // opcional. Vazio: o card mostra só o preço, como antes.
  unidade_venda: string | null;
};

// Linha da tabela produto_cento_itens: um subitem (sabor) de um produto
// tipo "cento", referenciando outro produto real do catálogo.
export type ProdutoCentoItem = {
  id: string;
  cento_nome: string;
  subitem_nome: string;
  ordem: number;
};
