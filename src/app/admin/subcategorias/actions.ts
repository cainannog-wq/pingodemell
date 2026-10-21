"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/supabase/dal";
import { ehUuid } from "@/lib/galeria/regras";
import { mensagemEmUso, traduzirErroSubcategoria } from "@/lib/subcategorias/erros";
import { parseCategoriaSubcategoria, parseNomeSubcategoria } from "@/lib/subcategorias/parse";
import { planejarOrdem } from "@/lib/subcategorias/regras";
import { invalidarVitrine } from "@/lib/vitrine/cache";

export type ResultadoSubcategoria = { error?: string };

const NAO_ENCONTRADA = "Subcategoria não encontrada. Ela pode ter sido apagada por outra pessoa.";

// Subcategorias: segundo nível de categoria (supabase/subcategorias.sql). Só o
// servidor grava, com a sessão do admin (a RLS só deixa o usuário logado
// escrever). Cada ação confere o login, valida com funções puras, traduz o erro
// do banco e invalida o cache da vitrine depois de gravar. O slug nunca é
// enviado: o banco gera e trava. A categoria é fixa depois de criada.

export async function criarSubcategoria(categoriaBruta: string, nomeBruto: string): Promise<ResultadoSubcategoria> {
  await requireAuth();

  const categoria = parseCategoriaSubcategoria(categoriaBruta);
  if (!categoria.success) return { error: categoria.error };
  const nome = parseNomeSubcategoria(nomeBruto);
  if (!nome.success) return { error: nome.error };

  // `ordem` fica de fora de propósito: o gatilho do banco põe a nova no fim
  // da categoria (maior ordem + 10).
  const supabase = await createClient();
  const { error } = await supabase.from("subcategorias").insert({ categoria: categoria.data, nome: nome.data });
  if (error) return { error: traduzirErroSubcategoria(error) };

  invalidarVitrine();
  revalidatePath("/admin/subcategorias");
  return {};
}

export async function renomearSubcategoria(id: string, nomeBruto: string): Promise<ResultadoSubcategoria> {
  await requireAuth();
  if (!ehUuid(id)) return { error: NAO_ENCONTRADA };

  const nome = parseNomeSubcategoria(nomeBruto);
  if (!nome.success) return { error: nome.error };

  // Renomear não muda o slug (o gatilho do banco o trava).
  const supabase = await createClient();
  const { data, error } = await supabase.from("subcategorias").update({ nome: nome.data }).eq("id", id).select("id");
  if (error) return { error: traduzirErroSubcategoria(error) };

  invalidarVitrine();
  revalidatePath("/admin/subcategorias");
  if (!data || data.length === 0) return { error: NAO_ENCONTRADA };
  return {};
}

// Liga e desliga. Desativar é sempre permitido: o produto continua ligado, e
// a subcategoria só deixa de aparecer para o público.
export async function atualizarAtivoSubcategoria(id: string, ativo: boolean): Promise<ResultadoSubcategoria> {
  await requireAuth();
  if (!ehUuid(id)) return { error: NAO_ENCONTRADA };

  const supabase = await createClient();
  const { data, error } = await supabase.from("subcategorias").update({ ativo }).eq("id", id).select("id");
  if (error) return { error: traduzirErroSubcategoria(error) };

  invalidarVitrine();
  revalidatePath("/admin/subcategorias");
  if (!data || data.length === 0) return { error: NAO_ENCONTRADA };
  return {};
}

// Nova ordem de uma categoria (a pessoa arrastou uma subcategoria). Os ids chegam
// na ordem nova; a categoria é relida aqui, na hora (não vale a ordem que a tela
// mostrava) e a ordem só vale se cobrir exatamente as subcategorias de hoje. A
// categoria inteira é renumerada de 10 em 10, gravando só as linhas cujo `ordem`
// mudou. Não há `unique` em `ordem`: se uma gravação falhar no meio, sobra no
// máximo um empate (desempata por nome) que a próxima ordenação corrige.
export async function reordenarSubcategorias(categoriaBruta: string, ids: string[]): Promise<ResultadoSubcategoria> {
  await requireAuth();
  const categoria = parseCategoriaSubcategoria(categoriaBruta);
  if (!categoria.success) return { error: categoria.error };
  if (!Array.isArray(ids) || ids.length > 100 || !ids.every((id) => typeof id === "string" && ehUuid(id))) return { error: NAO_ENCONTRADA };

  const supabase = await createClient();
  const { data: linhas, error: erroLeitura } = await supabase.from("subcategorias").select("id, categoria, nome, ordem");
  if (erroLeitura) return { error: traduzirErroSubcategoria(erroLeitura) };

  const mudancas = planejarOrdem((linhas ?? []).filter((l) => l.categoria === categoria.data), ids);
  if (mudancas === null) return { error: "A lista mudou em outra tela. Recarregue a página e tente de novo." };
  // Já estava nessa ordem: nada a gravar.
  if (mudancas.length === 0) return {};

  const resultados = await Promise.all(
    mudancas.map((m) => supabase.from("subcategorias").update({ ordem: m.ordem }).eq("id", m.id))
  );
  const falha = resultados.find((r) => r.error);

  invalidarVitrine();
  revalidatePath("/admin/subcategorias");
  if (falha) return { error: traduzirErroSubcategoria(falha.error) };
  return {};
}

// O banco recusa apagar subcategoria com produto ligado (23503). Aqui o
// servidor conta os produtos para dizer quantos usam.
export async function apagarSubcategoria(id: string): Promise<ResultadoSubcategoria> {
  await requireAuth();
  if (!ehUuid(id)) return { error: NAO_ENCONTRADA };

  const supabase = await createClient();
  const { data, error } = await supabase.from("subcategorias").delete().eq("id", id).select("id");
  if (error) {
    if (error.code === "23503") {
      const { count, error: erroContagem } = await supabase
        .from("produtos")
        .select("id", { count: "exact", head: true })
        .eq("subcategoria_id", id);
      if (erroContagem || count === null) return { error: traduzirErroSubcategoria(error) };
      return { error: mensagemEmUso(count) };
    }
    return { error: traduzirErroSubcategoria(error) };
  }

  invalidarVitrine();
  revalidatePath("/admin/subcategorias");
  if (!data || data.length === 0) return { error: NAO_ENCONTRADA };
  return {};
}
