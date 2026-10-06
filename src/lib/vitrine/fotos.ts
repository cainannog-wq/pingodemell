import type { SupabaseClient } from "@supabase/supabase-js";
import { BUCKET_FOTOS, textoAlternativo } from "@/lib/galeria/regras";

// Fotos de um produto na interna (/produtos/{slug}): capa primeiro, depois
// as fotos extras na ordem da posição, cada uma com o texto alternativo
// automático.

export type FotoProduto = { url: string; alt: string };

type ProdutoComCapa = { nome: string; image_url: string | null };

// Regra pura (coberta por teste): capa conta como foto 1 quando existe.
export function montarFotos(
  produto: ProdutoComCapa,
  caminhosExtras: string[],
  urlPublica: (caminho: string) => string
): FotoProduto[] {
  const urls = [...(produto.image_url ? [produto.image_url] : []), ...caminhosExtras.map(urlPublica)];
  return urls.map((url, i) => ({ url, alt: textoAlternativo(produto.nome, i + 1, urls.length) }));
}

// Endereços públicos das fotos extras pelo slug do produto, na ordem da
// posição. A junção com produtos pelo slug deixa a consulta sair junto com
// a do produto (buscarInterna), sem esperar o id. Quem decide se o produto
// está ativo é a consulta do produto: sem ela, as fotos não são usadas. Para
// o anônimo, a RLS de produto_fotos e a de produtos (na junção) já escondem
// as fotos de produto inativo. LANÇA erro em caso de falha (a leitura fica
// no cache da vitrine, que não guarda erro; a interna mostra só a capa).
export async function lerFotosExtras(supabase: SupabaseClient, slug: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("produto_fotos")
    .select("caminho, produto:produtos!inner(slug)")
    .eq("produto.slug", slug)
    .order("posicao", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map((linha) => supabase.storage.from(BUCKET_FOTOS).getPublicUrl(linha.caminho as string).data.publicUrl);
}
