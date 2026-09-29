import {
  GRUPO_RECHEIO_LABELS,
  GRUPO_RECHEIO_VALUES,
  NOME_RECHEIO_MAX,
  type GrupoRecheio,
} from "./types";

export type ParsedRecheio = {
  nome: string;
  vale_bolo: boolean;
  vale_bento: boolean;
  // Só com vale_bolo; senão null (o banco exige nulo, igual a esta regra).
  preco_kg: number | null;
  grupo: GrupoRecheio | null;
  ativo: boolean;
};

export type ParseRecheioResult = { success: true; data: ParsedRecheio } | { success: false; error: string };

// Mesmo formato do campo de preço do produto: "12.5" (campo com máscara) ou
// "12,50" / "1.234,56" (formato brasileiro).
function normalizarPreco(raw: string): number {
  const t = raw.trim();
  if (t.includes(",")) return Number(t.replace(/\./g, "").replace(",", "."));
  return Number(t);
}

// Função pura (sem I/O). Preço e grupo só valem — e só são lidos — quando o
// recheio vale para o Bolo grande; num recheio só de Bento eles são
// ignorados e gravados como nulo, mesmo que o formulário mande algo.
export function parseRecheioForm(formData: FormData): ParseRecheioResult {
  const nome = String(formData.get("nome") ?? "").trim().replace(/\s+/g, " ");
  const vale_bolo = formData.get("vale_bolo") != null;
  const vale_bento = formData.get("vale_bento") != null;
  const ativo = formData.get("ativo") != null;

  if (!nome) return { success: false, error: "Informe o nome do recheio." };
  if (nome.length > NOME_RECHEIO_MAX) {
    return { success: false, error: `O nome do recheio tem no máximo ${NOME_RECHEIO_MAX} caracteres.` };
  }
  if (!vale_bolo && !vale_bento) {
    return { success: false, error: "Marque onde o recheio vale: Bolo grande, Bento Cake ou os dois." };
  }

  let preco_kg: number | null = null;
  let grupo: GrupoRecheio | null = null;
  if (vale_bolo) {
    const preco = normalizarPreco(String(formData.get("preco_kg") ?? ""));
    if (!Number.isFinite(preco) || preco <= 0) {
      return { success: false, error: "Informe o preço por kg do recheio (maior que zero)." };
    }
    preco_kg = Math.round(preco * 100) / 100;
    const grupoRaw = String(formData.get("grupo") ?? "");
    if (!GRUPO_RECHEIO_VALUES.includes(grupoRaw as GrupoRecheio)) {
      return {
        success: false,
        error: `Escolha o grupo do recheio: ${GRUPO_RECHEIO_VALUES.map((g) => GRUPO_RECHEIO_LABELS[g]).join(" ou ")}.`,
      };
    }
    grupo = grupoRaw as GrupoRecheio;
  }

  return { success: true, data: { nome, vale_bolo, vale_bento, preco_kg, grupo, ativo } };
}
