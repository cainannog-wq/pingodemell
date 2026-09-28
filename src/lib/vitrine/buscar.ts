import type { CategoriaProduto } from "@/lib/produtos/types";
import { createClient } from "@/lib/supabase/server";
import { montarLista, type ItemLista } from "./lista";
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

// Busca os produtos da Lista (/produtos) e aplica a regra em montarLista
// (inativo fora, destaques primeiro, ordem alfabética). O filtro de ativo
// fica na consulta E na regra: o cliente do servidor leva a sessão do
// cookie, então um admin logado navegando no site recebe do banco também
// os inativos — com ou sem a RLS de leitura só de ativos. Retorna null em caso de erro (a página
// mostra aviso de falha, não "categoria vazia").
export async function buscarLista(categoria: CategoriaProduto | null): Promise<ItemLista[] | null> {
  const supabase = await createClient();
  let consulta = supabase.from("produtos").select(CAMPOS_VITRINE).eq("ativo", true);
  if (categoria) consulta = consulta.eq("Categoria", categoria);

  const { data, error } = await consulta;

  if (error) {
    console.error("Falha ao buscar a Lista de produtos:", error.message);
    return null;
  }

  return montarLista((data ?? []) as ProdutoVitrine[], categoria);
}

// Formato do slug, igual à restrição produtos_slug_formato do banco.
export const FORMATO_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Produto da interna (/produtos/{slug}), pronta para a página que ainda
// não existe. A leitura por slug fica AQUI, no código do site — não existe
// (e não deve ser criada) função de banco pública para isso. Só produto
// ativo, com o filtro na própria consulta E aqui: o admin logado navegando
// no site lê do banco também os inativos. Retorna null quando não há o que
// mostrar: slug fora do formato (nem consulta o banco), inexistente,
// inativo ou falha do banco (registrada no log).
export async function buscarProdutoPorSlug(slug: string): Promise<ProdutoVitrine | null> {
  if (!FORMATO_SLUG.test(slug)) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produtos")
    .select(CAMPOS_VITRINE)
    .eq("slug", slug)
    .eq("ativo", true)
    .maybeSingle();

  if (error) {
    console.error("Falha ao buscar o produto pelo slug:", slug, error.message);
    return null;
  }

  const produto = data as ProdutoVitrine | null;
  return produto?.ativo === true ? produto : null;
}
