import {
  CATEGORIA_VALUES,
  STEP_QUANTIDADE_VALUES,
  type CategoriaProduto,
  type StepQuantidade,
} from "./types";

export type ParsedProduto = {
  nome: string;
  preco: number;
  descricao: string;
  pedido_minimo: number;
  categoria: CategoriaProduto | null;
  prazo_producao_dias: number;
  step_quantidade: StepQuantidade;
  destaque: boolean;
  ativo: boolean;
};

export type ParseProdutoResult =
  | { success: true; data: ParsedProduto }
  | { success: false; error: string };

// Função pura (sem I/O), testável sem precisar de credencial do Supabase.
export function parseProdutoForm(formData: FormData): ParseProdutoResult {
  const nome = String(formData.get("nome") ?? "").trim();
  const descricao = String(formData.get("descricao") ?? "").trim();
  const precoRaw = String(formData.get("preco") ?? "").replace(",", ".");
  const pedidoMinimoRaw = String(formData.get("pedido_minimo") ?? "");
  const categoriaRaw = String(formData.get("categoria") ?? "").trim();
  const prazoRaw = String(formData.get("prazo_producao_dias") ?? "");
  const stepRaw = String(formData.get("step_quantidade") ?? "");
  const destaque = formData.get("destaque") != null;
  const ativo = formData.get("ativo") != null;

  const preco = Number(precoRaw);
  const pedido_minimo = Number(pedidoMinimoRaw);
  const prazo_producao_dias = Number(prazoRaw);

  if (!nome) {
    return { success: false, error: "Informe o nome do produto." };
  }
  if (!Number.isFinite(preco) || preco <= 0) {
    return { success: false, error: "Informe um preço válido." };
  }
  if (!Number.isInteger(pedido_minimo) || pedido_minimo < 1) {
    return {
      success: false,
      error: "Informe um pedido mínimo válido (mínimo 1).",
    };
  }
  if (!Number.isInteger(prazo_producao_dias) || prazo_producao_dias < 1) {
    return {
      success: false,
      error: "Informe um prazo de produção válido, em dias (mínimo 1).",
    };
  }
  if (!STEP_QUANTIDADE_VALUES.includes(stepRaw as StepQuantidade)) {
    return { success: false, error: "Selecione um step de quantidade." };
  }
  if (categoriaRaw && !CATEGORIA_VALUES.includes(categoriaRaw as CategoriaProduto)) {
    return { success: false, error: "Selecione uma categoria válida." };
  }

  return {
    success: true,
    data: {
      nome,
      preco,
      descricao,
      pedido_minimo,
      categoria: categoriaRaw ? (categoriaRaw as CategoriaProduto) : null,
      prazo_producao_dias,
      step_quantidade: stepRaw as StepQuantidade,
      destaque,
      ativo,
    },
  };
}
