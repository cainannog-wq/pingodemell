import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Kit por pessoa (tipo kit_pessoa): nasce só pela carga CSV e a composição
// (grupos, tamanhos e quantidades) fica em tabelas filhas. O Salvar do
// produto nunca cria um kit nem tira o tipo de um kit que já tem composição:
// perderia a composição sem aviso (as tabelas filhas apagam em cascata só
// com o produto) ou deixaria um produto de outro tipo com composição órfã.

export const ERRO_KIT_SO_POR_CARGA = "O tipo Kit por pessoa só é criado pela carga de kits.";
export const ERRO_KIT_COM_COMPOSICAO = "Este kit tem composição e não pode mudar de tipo.";
export const ERRO_KIT_LEITURA = "Não foi possível conferir a composição do kit. Tente de novo.";

// Devolve a mensagem de recusa, ou null se o tipo enviado pode ser gravado.
// Só consulta o banco quando o tipo guardado era kit_pessoa e o enviado é outro.
export async function recusarTrocaDeTipo(
  supabase: Supabase,
  produtoId: string,
  tipoGuardado: string | null | undefined,
  tipoEnviado: string
): Promise<string | null> {
  if (tipoEnviado === "kit_pessoa" && tipoGuardado !== "kit_pessoa") return ERRO_KIT_SO_POR_CARGA;
  if (tipoGuardado !== "kit_pessoa" || tipoEnviado === "kit_pessoa") return null;
  const { count, error } = await supabase
    .from("kit_grupos")
    .select("id", { count: "exact", head: true })
    .eq("produto_id", produtoId);
  if (error) return ERRO_KIT_LEITURA;
  return (count ?? 0) > 0 ? ERRO_KIT_COM_COMPOSICAO : null;
}
