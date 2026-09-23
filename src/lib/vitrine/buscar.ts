import { createClient } from "@/lib/supabase/server";
import { CAMPOS_VITRINE, selecionarMaisPedidos, type ProdutoVitrine } from "./mais-pedidos";

// Busca os candidatos a "Os mais pedidos" (ativo + destaque) e aplica a
// regra completa em selecionarMaisPedidos (bebida fora, ordem, limite) —
// a regra fica numa função pura, coberta por teste automatizado.
// Em caso de erro, a seção simplesmente não aparece na Home.
export async function buscarMaisPedidos(): Promise<ProdutoVitrine[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produtos")
    .select(CAMPOS_VITRINE)
    .eq("ativo", true)
    .eq("destaque", true);

  if (error) {
    console.error("Falha ao buscar 'Os mais pedidos':", error.message);
    return [];
  }

  return selecionarMaisPedidos((data ?? []) as ProdutoVitrine[]);
}
