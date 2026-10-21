"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/supabase/dal";
import { ehUuid } from "@/lib/galeria/regras";
import {
  parseDescricaoItem,
  parseNomeItem,
  planejarMovimento,
  proximaPosicao,
  traduzirErroKit,
  type Direcao,
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

// Sobe ou desce uma posição. A lista é relida aqui, na hora do clique (não
// vale a ordem que a tela mostrava) e renumerada de 1 em 1; só as linhas que
// mudaram vão, num upsert único por id.
export async function moverOpcao(id: string, direcao: Direcao): Promise<ResultadoKitLista> {
  await requireAuth();
  if (!ehUuid(id) || (direcao !== "subir" && direcao !== "descer")) return { error: NAO_ENCONTRADO };

  const supabase = await createClient();
  const { data: alvo, error: erroAlvo } = await supabase
    .from("kit_lista_itens")
    .select("id, lista_id")
    .eq("id", id)
    .maybeSingle<{ id: string; lista_id: string }>();
  if (erroAlvo) return { error: traduzirErroKit(erroAlvo) };
  if (!alvo) return { error: NAO_ENCONTRADO };

  const { data: itens, error: erroLeitura } = await supabase
    .from("kit_lista_itens")
    .select("id, lista_id, nome, descricao, posicao, ativo")
    .eq("lista_id", alvo.lista_id);
  if (erroLeitura) return { error: traduzirErroKit(erroLeitura) };

  const mudancas = planejarMovimento((itens ?? []) as never[], id, direcao);
  // Já é o primeiro (ou o último): nada a gravar.
  if (!mudancas || mudancas.length === 0) return {};

  const { error } = await supabase.from("kit_lista_itens").upsert(mudancas, { onConflict: "id" });
  invalidarVitrine();
  revalidatePath("/admin/kit-listas");
  if (error) return { error: traduzirErroKit(error) };
  return {};
}
