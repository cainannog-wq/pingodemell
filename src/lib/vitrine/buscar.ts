import type { CategoriaProduto } from "@/lib/produtos/types";
import { createClient } from "@/lib/supabase/server";
import { montarLista, type GrupoLista } from "./lista";
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
// (inativo fora, grupos, ordem). O filtro de ativo fica na consulta E na
// regra: o cliente do servidor leva a sessão do cookie, então um admin
// logado navegando no site recebe do banco também os inativos — com ou sem
// a RLS de leitura só de ativos. Retorna null em caso de erro (a página
// mostra aviso de falha, não "categoria vazia").
export async function buscarLista(categoria: CategoriaProduto | null): Promise<GrupoLista[] | null> {
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
