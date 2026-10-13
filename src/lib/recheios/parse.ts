import {
  GRUPO_RECHEIO_LABELS,
  GRUPO_RECHEIO_VALUES,
  NOME_RECHEIO_MAX,
  type GrupoRecheio,
} from "./types";

// O catálogo é só do Bolo tradicional. vale_bento NÃO é enviado nunca: a
// coluna e os dados dela ficam como estão (a produção ainda a lê enquanto o
// PR dos recheios por produto está em homologação), e a lista de recheios do
// Bento Cake agora é do próprio produto (supabase/produto-recheios.sql).
export type ParsedRecheio = {
  nome: string;
  // Sempre verdadeiro: todo recheio salvo por este formulário vale no Bolo.
  vale_bolo: true;
  preco_kg: number;
  grupo: GrupoRecheio;
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

// Função pura (sem I/O). Preço por kg e grupo são sempre obrigatórios.
export function parseRecheioForm(formData: FormData): ParseRecheioResult {
  const nome = String(formData.get("nome") ?? "").trim().replace(/\s+/g, " ");
  const ativo = formData.get("ativo") != null;

  if (!nome) return { success: false, error: "Informe o nome do recheio." };
  if (nome.length > NOME_RECHEIO_MAX) {
    return { success: false, error: `O nome do recheio tem no máximo ${NOME_RECHEIO_MAX} caracteres.` };
  }

  const preco = normalizarPreco(String(formData.get("preco_kg") ?? ""));
  if (!Number.isFinite(preco) || preco <= 0) {
    return { success: false, error: "Informe o preço por kg do recheio (maior que zero)." };
  }
  const grupoRaw = String(formData.get("grupo") ?? "");
  if (!GRUPO_RECHEIO_VALUES.includes(grupoRaw as GrupoRecheio)) {
    return {
      success: false,
      error: `Escolha o grupo do recheio: ${GRUPO_RECHEIO_VALUES.map((g) => GRUPO_RECHEIO_LABELS[g]).join(" ou ")}.`,
    };
  }

  return { success: true, data: { nome, vale_bolo: true, preco_kg: Math.round(preco * 100) / 100, grupo: grupoRaw as GrupoRecheio, ativo } };
}
