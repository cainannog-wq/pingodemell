"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/supabase/dal";
import { ehUuid } from "@/lib/galeria/regras";
import { parseRecheioForm } from "@/lib/recheios/parse";
import { invalidarVitrine } from "@/lib/vitrine/cache";

export type RecheioFormState = { error?: string };

const MENSAGEM_NOME_REPETIDO = "Já existe um recheio com esse nome.";

// Catálogo único de recheios (Bolo grande e Bento Cake). Recheio nunca é
// apagado pelo CMS: sai de circulação desativando (ativo = false), no mesmo
// espírito do sabor do Cento. Só o servidor grava, com a sessão do admin
// (a RLS de recheios só deixa o usuário logado escrever).

export async function createRecheio(_prev: RecheioFormState, formData: FormData): Promise<RecheioFormState> {
  await requireAuth();

  const parsed = parseRecheioForm(formData);
  if (!parsed.success) return { error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase.from("recheios").insert(parsed.data);
  if (error) {
    if (error.code === "23505") return { error: MENSAGEM_NOME_REPETIDO };
    return { error: `Não foi possível salvar o recheio: ${error.message}` };
  }

  // Recheio muda o que a cliente vê (opções, "a partir de" do Bolo, Bolo e
  // Bento disponíveis): o cache da vitrine é refeito na próxima visita.
  invalidarVitrine();
  revalidatePath("/admin/recheios");
  redirect("/admin/recheios");
}

export async function updateRecheio(id: string, _prev: RecheioFormState, formData: FormData): Promise<RecheioFormState> {
  await requireAuth();
  if (!ehUuid(id)) return { error: "Recheio não encontrado." };

  const parsed = parseRecheioForm(formData);
  if (!parsed.success) return { error: parsed.error };

  const supabase = await createClient();
  const { data, error } = await supabase.from("recheios").update(parsed.data).eq("id", id).select("id");
  if (error) {
    if (error.code === "23505") return { error: MENSAGEM_NOME_REPETIDO };
    return { error: `Não foi possível salvar o recheio: ${error.message}` };
  }
  invalidarVitrine();
  if (!data || data.length === 0) return { error: "Recheio não encontrado. Ele pode ter sido excluído." };

  revalidatePath("/admin/recheios");
  redirect("/admin/recheios");
}

// Liga/desliga o recheio direto na listagem.
export async function updateRecheioAtivo(id: string, ativo: boolean): Promise<{ error?: string }> {
  await requireAuth();
  if (!ehUuid(id)) return { error: "Recheio não encontrado." };

  const supabase = await createClient();
  const { error } = await supabase.from("recheios").update({ ativo }).eq("id", id);
  if (error) return { error: `Não foi possível atualizar o status: ${error.message}` };

  invalidarVitrine();
  revalidatePath("/admin/recheios");
  return {};
}
