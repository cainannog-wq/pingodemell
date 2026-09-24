import { createClient } from "@/lib/supabase/server";
import { BUCKET_FOTOS, textoAlternativo } from "@/lib/galeria/regras";

// Fotos de um produto para a futura página interna (/produtos/{id}): capa
// primeiro, depois as fotos extras na ordem da posição, cada uma com o
// texto alternativo automático. Nenhuma página usa esta função ainda.

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

// O filtro de ativo fica na própria consulta, como em toda leitura
// pública: um admin logado navegando no site lê com a própria sessão, que
// enxerga produto inativo (e as fotos dele). Produto inativo ou
// inexistente devolve lista vazia. Retorna null em caso de erro.
export async function buscarFotosProduto(produtoId: string): Promise<FotoProduto[] | null> {
  const supabase = await createClient();

  const { data: produto, error } = await supabase
    .from("produtos")
    .select("nome, image_url")
    .eq("id", produtoId)
    .eq("ativo", true)
    .maybeSingle<ProdutoComCapa>();

  if (error) {
    console.error("Falha ao buscar o produto das fotos:", error.message);
    return null;
  }
  if (!produto) return [];

  const { data: extras, error: erroExtras } = await supabase
    .from("produto_fotos")
    .select("caminho")
    .eq("produto_id", produtoId)
    .order("posicao", { ascending: true });

  if (erroExtras) {
    console.error("Falha ao buscar as fotos extras:", erroExtras.message);
    return null;
  }

  return montarFotos(
    produto,
    (extras ?? []).map((linha) => linha.caminho as string),
    (caminho) => supabase.storage.from(BUCKET_FOTOS).getPublicUrl(caminho).data.publicUrl
  );
}
