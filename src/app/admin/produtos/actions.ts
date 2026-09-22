"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/supabase/dal";
import { parseProdutoForm } from "@/lib/produtos/parse";

// Nome do bucket público de storage onde ficam as fotos dos produtos.
const BUCKET = "Pingo de Mell";

export type ProdutoFormState = {
  error?: string;
};

const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

async function uploadFoto(
  supabase: Awaited<ReturnType<typeof createClient>>,
  foto: File
) {
  if (!ALLOWED_PHOTO_TYPES.includes(foto.type)) {
    throw new Error("A foto precisa ser JPG, PNG ou WebP.");
  }
  if (foto.size > MAX_PHOTO_BYTES) {
    throw new Error("A foto precisa ter até 2 MB.");
  }

  const extension = foto.name.includes(".") ? foto.name.split(".").pop() : "jpg";
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, foto, {
    contentType: foto.type || undefined,
    upsert: false,
  });

  if (error) {
    throw new Error(`Falha ao enviar a foto: ${error.message}`);
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function createProduto(
  _prevState: ProdutoFormState,
  formData: FormData
): Promise<ProdutoFormState> {
  await requireAuth();

  const parsed = parseProdutoForm(formData);
  if (!parsed.success) return { error: parsed.error };
  const { nome, preco, descricao, pedido_minimo, categoria, prazo_producao_dias, step_quantidade, destaque, ativo } =
    parsed.data;

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("produtos")
    .select("nome")
    .eq("nome", nome)
    .maybeSingle();

  if (existing) {
    return { error: "Já existe um produto cadastrado com esse nome." };
  }

  let image_url: string | null = null;
  const foto = formData.get("foto");
  if (foto instanceof File && foto.size > 0) {
    try {
      image_url = await uploadFoto(supabase, foto);
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Falha ao enviar a foto." };
    }
  }

  const { error } = await supabase.from("produtos").insert({
    nome,
    preco,
    descricao,
    pedido_minimo,
    Categoria: categoria,
    prazo_producao_dias,
    step_quantidade,
    destaque,
    ativo,
    image_url,
  });

  if (error) {
    return { error: `Não foi possível salvar o produto: ${error.message}` };
  }

  revalidatePath("/admin/produtos");
  redirect("/admin/produtos");
}

export async function updateProduto(
  nomeOriginal: string,
  _prevState: ProdutoFormState,
  formData: FormData
): Promise<ProdutoFormState> {
  await requireAuth();

  const parsed = parseProdutoForm(formData);
  if (!parsed.success) return { error: parsed.error };
  const { nome, preco, descricao, pedido_minimo, categoria, prazo_producao_dias, step_quantidade, destaque, ativo } =
    parsed.data;

  const supabase = await createClient();

  if (nome !== nomeOriginal) {
    const { data: existing } = await supabase
      .from("produtos")
      .select("nome")
      .eq("nome", nome)
      .maybeSingle();

    if (existing) {
      return { error: "Já existe um produto cadastrado com esse nome." };
    }
  }

  const update: Record<string, unknown> = {
    nome,
    preco,
    descricao,
    pedido_minimo,
    Categoria: categoria,
    prazo_producao_dias,
    step_quantidade,
    destaque,
    ativo,
  };

  const foto = formData.get("foto");
  if (foto instanceof File && foto.size > 0) {
    try {
      update.image_url = await uploadFoto(supabase, foto);
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Falha ao enviar a foto." };
    }
  }

  const { error } = await supabase
    .from("produtos")
    .update(update)
    .eq("nome", nomeOriginal);

  if (error) {
    return { error: `Não foi possível salvar o produto: ${error.message}` };
  }

  revalidatePath("/admin/produtos");
  redirect("/admin/produtos");
}

// Atualiza só o status ativo/inativo, usado pelo toggle inline da
// listagem (sem precisar abrir a edição completa do produto). Produto
// inativo continua editável no CMS; o efeito de sumir do catálogo
// público ainda não existe (catálogo não implementado nesta etapa).
export async function updateProdutoAtivo(
  nome: string,
  ativo: boolean
): Promise<{ error?: string }> {
  await requireAuth();

  const supabase = await createClient();
  const { error } = await supabase.from("produtos").update({ ativo }).eq("nome", nome);

  if (error) {
    return { error: `Não foi possível atualizar o status: ${error.message}` };
  }

  revalidatePath("/admin/produtos");
  return {};
}

export async function deleteProduto(nome: string) {
  await requireAuth();

  const supabase = await createClient();
  const { error } = await supabase.from("produtos").delete().eq("nome", nome);

  if (error) {
    throw new Error(`Não foi possível excluir o produto: ${error.message}`);
  }

  revalidatePath("/admin/produtos");
}
