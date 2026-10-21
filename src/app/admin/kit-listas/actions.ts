"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/supabase/dal";
import { ehUuid } from "@/lib/galeria/regras";
import {
  parseDescricaoItem,
  parseNomeItem,
  planejarOrdem,
  proximaPosicao,
  traduzirErroKit,
} from "@/lib/kit/listas";
import { invalidarVitrine } from "@/lib/vitrine/cache";

export type ResultadoKitLista = { error?: string };

const NAO_ENCONTRADO = "Opção não encontrada. Ela pode ter sido alterada por outra pessoa.";

// Editor das listas do kit (supabase/kit-pessoa-schema.sql). Sem função de
// banco: renomear, descrever, ativar e desativar são `update` por id; adicionar
// é `insert` na próxima posição; reordenar é um `upsert` único por id (a
// unicidade da posição é conferida no fim da instrução). O editor NUNCA apaga
// item: uma opção usada por uma quantidade não pode sumir (o banco recusa), e
// o que a Taami não quer mais é desativado. Só o servidor grava, com a sessão
// do admin; nenhuma mensagem crua do banco chega à tela.

export async function adicionarOpcao(listaId: string, nomeBruto: string, descricaoBruta: string): Promise<ResultadoKitLista> {
  await requireAuth();
  if (!ehUuid(listaId)) return { error: "Lista não encontrada." };
  const nome = parseNomeItem(nomeBruto);
  if (!nome.success) return { error: nome.error };
  const descricao = parseDescricaoItem(descricaoBruta);
  if (!descricao.success) return { error: descricao.error };

  const supabase = await createClient();
  const { data: existentes, error: erroLeitura } = await supabase
    .from("kit_lista_itens")
    .select("posicao")
    .eq("lista_id", listaId);
  if (erroLeitura) return { error: traduzirErroKit(erroLeitura) };
  const posicao = proximaPosicao((existentes ?? []) as { posicao: number }[]);
  if (posicao === null) return { error: "A lista já tem o máximo de opções." };

  const { error } = await supabase
    .from("kit_lista_itens")
    .insert({ lista_id: listaId, nome: nome.data, descricao: descricao.data, posicao });
  if (error) return { error: traduzirErroKit(error) };

  invalidarVitrine();
  revalidatePath("/admin/kit-listas");
  return {};
}

export async function editarOpcao(id: string, nomeBruto: string, descricaoBruta: string): Promise<ResultadoKitLista> {
  await requireAuth();
  if (!ehUuid(id)) return { error: NAO_ENCONTRADO };
  const nome = parseNomeItem(nomeBruto);
  if (!nome.success) return { error: nome.error };
  const descricao = parseDescricaoItem(descricaoBruta);
  if (!descricao.success) return { error: descricao.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("kit_lista_itens")
    .update({ nome: nome.data, descricao: descricao.data })
    .eq("id", id)
    .select("id");
  if (error) return { error: traduzirErroKit(error) };

  invalidarVitrine();
  revalidatePath("/admin/kit-listas");
  if (!data || data.length === 0) return { error: NAO_ENCONTRADO };
  return {};
}

// Desativar é sempre permitido, mesmo com a opção em uso: a quantidade
// continua gravada e a opção só deixa de aparecer para a cliente.
export async function atualizarAtivoOpcao(id: string, ativo: boolean): Promise<ResultadoKitLista> {
  await requireAuth();
  if (!ehUuid(id)) return { error: NAO_ENCONTRADO };

  const supabase = await createClient();
  const { data, error } = await supabase.from("kit_lista_itens").update({ ativo }).eq("id", id).select("id");
  if (error) return { error: traduzirErroKit(error) };

  invalidarVitrine();
  revalidatePath("/admin/kit-listas");
  if (!data || data.length === 0) return { error: NAO_ENCONTRADO };
  return {};
}

// Nova ordem de uma lista (a pessoa arrastou uma opção). Os ids chegam na ordem
// nova; a lista é relida aqui e a ordem só vale se cobrir exatamente os itens
// de hoje (senão a lista mudou em outra aba). Renumera de 1 em 1 e grava só as
// linhas que mudaram, num upsert único por id.
export async function reordenarOpcoes(listaId: string, ids: string[]): Promise<ResultadoKitLista> {
  await requireAuth();
  if (!ehUuid(listaId) || !Array.isArray(ids) || ids.length > 200 || !ids.every((id) => typeof id === "string" && ehUuid(id))) {
    return { error: NAO_ENCONTRADO };
  }

  const supabase = await createClient();
  const { data: itens, error: erroLeitura } = await supabase
    .from("kit_lista_itens")
    .select("id, lista_id, nome, descricao, posicao, ativo")
    .eq("lista_id", listaId);
  if (erroLeitura) return { error: traduzirErroKit(erroLeitura) };

  const mudancas = planejarOrdem((itens ?? []) as never[], ids);
  if (mudancas === null) return { error: "A lista mudou em outra tela. Recarregue a página e tente de novo." };
  // Já estava nessa ordem: nada a gravar.
  if (mudancas.length === 0) return {};

  const { error } = await supabase.from("kit_lista_itens").upsert(mudancas, { onConflict: "id" });
  invalidarVitrine();
  revalidatePath("/admin/kit-listas");
  if (error) return { error: traduzirErroKit(error) };
  return {};
}
