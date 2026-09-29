import { variacaoDoProduto } from "@/lib/vitrine/variacao";
import {
  CATEGORIA_DO_TIPO,
  CATEGORIA_VALUES,
  STEP_QUANTIDADE_VALUES,
  TIPO_PRODUTO_LABELS,
  TIPO_PRODUTO_VALUES,
  UNIDADE_VENDA_MAX,
  type CategoriaProduto,
  type StepQuantidade,
  type TipoProduto,
} from "./types";

export type ParsedProduto = {
  nome: string;
  preco: number;
  descricao: string;
  pedido_minimo: number;
  categoria: CategoriaProduto;
  unidade_venda: string | null;
  prazo_producao_dias: number;
  step_quantidade: StepQuantidade;
  destaque: boolean;
  ativo: boolean;
  tipo: TipoProduto;
  // true no tipo Bolo: preço, pedido mínimo, step e unidade de venda não
  // valem (o preço vem do recheio × kg) e o formulário nem os mostra. Os
  // quatro campos acima vêm com valores neutros, só para o cadastro novo
  // preencher as colunas obrigatórias; a edição NÃO os grava (preserva o
  // que já está no banco).
  semCamposDePreco: boolean;
  // Nomes dos produtos usados como subitens, na ordem escolhida no
  // formulário. Só tem efeito quando tipo === "cento"; para tipo
  // "normal" vem sempre vazio, mesmo que o campo chegue preenchido.
  subitens: string[];
};

export type ParseProdutoResult =
  | { success: true; data: ParsedProduto }
  | { success: false; error: string };

// Aceita tanto "1234.56" (campo oculto da máscara de moeda, sempre ponto
// decimal e sem separador de milhar) quanto "1.234,56" ou "1234,56"
// (formato brasileiro, por segurança caso o valor chegue sem passar pela
// máscara). Vírgula presente é o sinal de que pontos são separador de
// milhar, não decimal.
function normalizePreco(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed.includes(",")) {
    return Number(trimmed.replace(/\./g, "").replace(",", "."));
  }
  return Number(trimmed);
}

// Função pura (sem I/O), testável sem precisar de credencial do Supabase.
export function parseProdutoForm(formData: FormData): ParseProdutoResult {
  const nome = String(formData.get("nome") ?? "").trim();
  const descricao = String(formData.get("descricao") ?? "").trim();
  const precoRaw = String(formData.get("preco") ?? "");
  const pedidoMinimoRaw = String(formData.get("pedido_minimo") ?? "");
  const categoriaRaw = String(formData.get("categoria") ?? "").trim();
  const prazoRaw = String(formData.get("prazo_producao_dias") ?? "");
  const stepRaw = String(formData.get("step_quantidade") ?? "");
  const tipoRaw = String(formData.get("tipo") ?? "normal").trim();
  // Texto livre; espaços repetidos viram um só. Vazio vira null.
  const unidadeVenda = String(formData.get("unidade_venda") ?? "").trim().replace(/\s+/g, " ");
  const destaque = formData.get("destaque") != null;
  const ativo = formData.get("ativo") != null;

  // Quais campos valem depende do tipo (variacaoDoProduto). Tipo inválido é
  // recusado mais abaixo; até lá conta como avulso.
  const tipoConhecido = TIPO_PRODUTO_VALUES.includes(tipoRaw as TipoProduto);
  const variacao = tipoConhecido ? variacaoDoProduto({ tipo: tipoRaw as TipoProduto }) : "avulso";
  const bolo = variacao === "bolo";
  const bento = variacao === "bento";

  // Bolo: nada disso vale (preço do recheio × kg). Bento: peso fechado, sem
  // unidade nem step. Os campos escondidos do formulário nem chegam aqui, e
  // qualquer valor que chegue é ignorado.
  const preco = bolo ? 0 : normalizePreco(precoRaw);
  const pedido_minimo = bolo ? 1 : Number(pedidoMinimoRaw);
  const prazo_producao_dias = Number(prazoRaw);

  if (!nome) {
    return { success: false, error: "Informe o nome do produto." };
  }
  if (!bolo && (!Number.isFinite(preco) || preco <= 0)) {
    return { success: false, error: "Informe um preço válido." };
  }
  if (!bolo && (!Number.isInteger(pedido_minimo) || pedido_minimo < 1)) {
    return {
      success: false,
      error: "Informe um pedido mínimo válido (mínimo 1).",
    };
  }
  if (prazoRaw.trim() === "" || !Number.isInteger(prazo_producao_dias) || prazo_producao_dias < 0) {
    return {
      success: false,
      error: "Informe um prazo de produção válido, em dias (0 ou mais). Use 0 para produto sempre disponível.",
    };
  }
  if (!bolo && !bento && !STEP_QUANTIDADE_VALUES.includes(stepRaw as StepQuantidade)) {
    return { success: false, error: "Selecione um step de quantidade." };
  }
  // Categoria obrigatória no formulário (a coluna ainda aceita nulo no
  // banco: o NOT NULL fica para quando o lote for para a main).
  if (!categoriaRaw) {
    return { success: false, error: "Selecione a categoria do produto." };
  }
  if (!CATEGORIA_VALUES.includes(categoriaRaw as CategoriaProduto)) {
    return { success: false, error: "Selecione uma categoria válida." };
  }
  if (!bolo && !bento && unidadeVenda.length > UNIDADE_VENDA_MAX) {
    return {
      success: false,
      error: `A unidade de venda tem no máximo ${UNIDADE_VENDA_MAX} caracteres (ex.: kg, unidade, litro).`,
    };
  }
  if (!tipoConhecido) {
    return { success: false, error: "Selecione um tipo de produto válido." };
  }

  const tipo = tipoRaw as TipoProduto;

  // A categoria acompanha o tipo: Bolo só em Bolos, Bento Cake só em Bento
  // Cake, e a categoria Bento Cake só aceita o tipo Bento Cake. Smash Cake é
  // um produto normal em Bolos, sem tipo próprio.
  const categoriaExigida = CATEGORIA_DO_TIPO[tipo];
  if (categoriaExigida && categoriaRaw !== categoriaExigida) {
    return {
      success: false,
      error: `Um produto do tipo "${TIPO_PRODUTO_LABELS[tipo]}" precisa estar na categoria ${categoriaExigida}.`,
    };
  }
  if (categoriaRaw === "Bento Cake" && tipo !== "bento_cake") {
    return { success: false, error: 'A categoria Bento Cake exige o tipo "Bento Cake (com recheio)".' };
  }

  // Sem texto livre: cada subitem é o nome de um produto real, escolhido
  // no seletor de busca do formulário (um input hidden "subitem_nome" por
  // item, na ordem em que foi adicionado). Duplicata e autorreferência já
  // são bloqueadas na UI, mas a validação aqui é o que realmente impede
  // salvar um dado inconsistente.
  const subitensRaw = formData.getAll("subitem_nome").map((v) => String(v).trim()).filter(Boolean);
  const subitens = tipo === "cento" ? Array.from(new Set(subitensRaw)) : [];

  if (tipo === "cento" && subitens.length === 0) {
    return { success: false, error: "Um produto do tipo Cento precisa de pelo menos um subitem." };
  }
  if (tipo === "cento" && subitens.includes(nome)) {
    return { success: false, error: "Um produto Cento não pode ter a si mesmo como subitem." };
  }

  return {
    success: true,
    data: {
      nome,
      preco,
      descricao,
      pedido_minimo,
      categoria: categoriaRaw as CategoriaProduto,
      unidade_venda: bolo || bento ? null : unidadeVenda || null,
      prazo_producao_dias,
      step_quantidade: bolo || bento ? "livre" : (stepRaw as StepQuantidade),
      destaque,
      ativo,
      tipo,
      semCamposDePreco: bolo,
      subitens,
    },
  };
}
