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

// Substitui a lista inteira de subitens de um cento (delete + insert), mais
// simples do que calcular diff porque o formulário sempre manda a lista
// completa e já ordenada. Chamada só depois do produtos.insert/update ter
// dado certo, então uma falha aqui não deixa o produto pela metade — só
// sem subitens salvos, o que o admin percebe ao reabrir a edição.
async function salvarSubitensCento(
  supabase: Awaited<ReturnType<typeof createClient>>,
  centoNome: string,
  subitens: string[]
) {
  const { error: deleteError } = await supabase
    .from("produto_cento_itens")
    .delete()
    .eq("cento_nome", centoNome);

  if (deleteError) {
    return `Produto salvo, mas não foi possível atualizar a lista de subitens: ${deleteError.message}`;
  }

  if (subitens.length === 0) return null;

  const { error: insertError } = await supabase.from("produto_cento_itens").insert(
    subitens.map((subitem_nome, index) => ({
      cento_nome: centoNome,
      subitem_nome,
      ordem: index,
    }))
  );

  if (insertError) {
    return `Produto salvo, mas não foi possível atualizar a lista de subitens: ${insertError.message}`;
  }

  return null;
}

export async function createProduto(
  _prevState: ProdutoFormState,
  formData: FormData
): Promise<ProdutoFormState> {
  await requireAuth();

  const parsed = parseProdutoForm(formData);
  if (!parsed.success) return { error: parsed.error };
  const {
    nome,
    preco,
    descricao,
    pedido_minimo,
    categoria,
    prazo_producao_dias,
    step_quantidade,
    destaque,
    ativo,
    tipo,
    subitens,
  } = parsed.data;

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
    tipo,
    image_url,
  });

  if (error) {
    return { error: `Não foi possível salvar o produto: ${error.message}` };
  }

  if (tipo === "cento") {
    const subitensError = await salvarSubitensCento(supabase, nome, subitens);
    if (subitensError) return { error: subitensError };
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
  const {
    nome,
    preco,
    descricao,
    pedido_minimo,
    categoria,
    prazo_producao_dias,
    step_quantidade,
    destaque,
    ativo,
    tipo,
    subitens,
  } = parsed.data;

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
    tipo,
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

  // A FK de produto_cento_itens tem "on update cascade": se o nome mudou,
  // as linhas que já existiam (como cento_nome ou como subitem_nome de
  // outro cento) já foram renomeadas automaticamente pelo banco no update
  // acima. `nome` abaixo é sempre o nome atual (novo, se mudou).
  const subitensError = await salvarSubitensCento(supabase, nome, tipo === "cento" ? subitens : []);
  if (subitensError) return { error: subitensError };

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
