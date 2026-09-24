"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/supabase/dal";
import { parseProdutoForm } from "@/lib/produtos/parse";
import {
  BUCKET_FOTOS as BUCKET,
  MENSAGEM_LIMITE_SERVIDOR,
  ehExtensaoFoto,
  ehUuid,
  lerGaleria,
  type ExtensaoFoto,
  type ItemGaleria,
} from "@/lib/galeria/regras";
import { apagarPastaDoProduto, criarEnviosAssinados, verificarArquivosNovos, type EnvioAssinado } from "@/lib/galeria/storage-servidor";
import { galeriaMudou, gravarGaleria, lerFotosAtuais, limparSobras } from "./galeria-servidor";

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

function fotosNovas(itens: ItemGaleria[]) {
  return itens.filter((item): item is { novo: string; ext: ExtensaoFoto } => "novo" in item);
}

// Galeria de fotos extras ao Salvar, na ordem:
// 1. o navegador já subiu as fotos novas (prepararEnvioFotos) para
//    galeria/{id}/ — nada foi gravado no banco ainda;
// 2. aqui o servidor confere as fotos novas (existem, até 2 MB, tipo real);
// 3. grava o produto (como antes);
// 4. subitens do Cento (como antes);
// 5. grava a galeria inteira numa transação (salvar_produto_fotos);
// 6. apaga da pasta todo arquivo sem linha no banco (removidas e sobras).
// Falha em 2 ou 3: nada gravado, arquivos novos apagados. Falha em 4 ou 5:
// produto salvo, galeria como estava, arquivos novos apagados. Falha em 6:
// só vai para o log (o próximo Salvar que mexer na galeria limpa).
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

  // O id do produto novo vem do formulário (gerado no navegador) porque as
  // fotos extras sobem para galeria/{id}/ antes de o produto existir.
  const produtoId = formData.get("id");
  if (!ehUuid(produtoId)) return { error: "Formulário inválido. Recarregue a página e tente de novo." };

  const galeria = lerGaleria(formData.get("galeria"));
  if (!galeria.ok) return { error: galeria.erro };
  if (galeria.itens.some((item) => "id" in item)) return { error: "Lista de fotos extras inválida." };
  const novas = fotosNovas(galeria.itens);

  const erroFotos = await verificarArquivosNovos(produtoId, novas);
  if (erroFotos) {
    await limparSobras(supabase, produtoId);
    return { error: erroFotos };
  }

  let image_url: string | null = null;
  const foto = formData.get("foto");
  if (foto instanceof File && foto.size > 0) {
    try {
      image_url = await uploadFoto(supabase, foto);
    } catch (err) {
      if (novas.length > 0) await limparSobras(supabase, produtoId);
      return { error: err instanceof Error ? err.message : "Falha ao enviar a foto." };
    }
  }

  const { error } = await supabase.from("produtos").insert({
    id: produtoId,
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
    if (novas.length > 0) await limparSobras(supabase, produtoId);
    return { error: `Não foi possível salvar o produto: ${error.message}` };
  }

  if (tipo === "cento") {
    const subitensError = await salvarSubitensCento(supabase, nome, subitens);
    if (subitensError) {
      if (novas.length > 0) await limparSobras(supabase, produtoId);
      return { error: subitensError };
    }
  }

  if (novas.length > 0) {
    const erroGaleria = await gravarGaleria(supabase, produtoId, galeria.itens);
    if (erroGaleria) {
      await limparSobras(supabase, produtoId);
      return {
        error: `Produto salvo, mas as fotos extras não foram salvas: ${erroGaleria} Abra o produto na listagem para adicioná-las de novo.`,
      };
    }
    await limparSobras(supabase, produtoId);
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

  const { data: atual } = await supabase
    .from("produtos")
    .select("id")
    .eq("nome", nomeOriginal)
    .maybeSingle<{ id: string }>();
  if (!atual || !ehUuid(atual.id)) return { error: "Produto não encontrado. Ele pode ter sido excluído ou renomeado." };
  const produtoId = atual.id;

  // Sem o campo "galeria" no formulário, a galeria não é tocada. Com ele,
  // só é regravada se mudou (foto nova, removida ou ordem diferente).
  let itensGaleria: ItemGaleria[] | null = null;
  if (formData.has("galeria")) {
    const galeria = lerGaleria(formData.get("galeria"));
    if (!galeria.ok) return { error: galeria.erro };
    const atuais = await lerFotosAtuais(supabase, produtoId);
    if (atuais === null) return { error: "Não foi possível ler as fotos extras atuais. Tente de novo." };
    if (galeriaMudou(galeria.itens, atuais)) itensGaleria = galeria.itens;
  }
  const novas = itensGaleria ? fotosNovas(itensGaleria) : [];

  const erroFotos = await verificarArquivosNovos(produtoId, novas);
  if (erroFotos) {
    await limparSobras(supabase, produtoId);
    return { error: erroFotos };
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
      if (novas.length > 0) await limparSobras(supabase, produtoId);
      return { error: err instanceof Error ? err.message : "Falha ao enviar a foto." };
    }
  }

  const { error } = await supabase
    .from("produtos")
    .update(update)
    .eq("nome", nomeOriginal);

  if (error) {
    if (novas.length > 0) await limparSobras(supabase, produtoId);
    return { error: `Não foi possível salvar o produto: ${error.message}` };
  }

  // A FK de produto_cento_itens tem "on update cascade": se o nome mudou,
  // as linhas que já existiam (como cento_nome ou como subitem_nome de
  // outro cento) já foram renomeadas automaticamente pelo banco no update
  // acima. `nome` abaixo é sempre o nome atual (novo, se mudou).
  const subitensError = await salvarSubitensCento(supabase, nome, tipo === "cento" ? subitens : []);
  if (subitensError) {
    if (novas.length > 0) await limparSobras(supabase, produtoId);
    return { error: subitensError };
  }

  // Galeria por último entre as gravações: se ela falhar, nada depois
  // dela ficou pela metade, e um novo Salvar reenvia tudo sem duplicar.
  if (itensGaleria) {
    const erroGaleria = await gravarGaleria(supabase, produtoId, itensGaleria);
    if (erroGaleria) {
      await limparSobras(supabase, produtoId);
      return {
        error: `Produto salvo, mas as fotos extras não foram atualizadas: ${erroGaleria} Suas alterações nas fotos continuam na tela; clique em Salvar de novo.`,
      };
    }
    await limparSobras(supabase, produtoId);
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

// Atualiza só o toggle de destaque, usado pelo menu de ações da listagem
// (mesmo padrão de updateProdutoAtivo). Sem efeito no catálogo público
// ainda, igual ao restante do campo "destaque".
export async function updateProdutoDestaque(
  nome: string,
  destaque: boolean
): Promise<{ error?: string }> {
  await requireAuth();

  const supabase = await createClient();
  const { error } = await supabase.from("produtos").update({ destaque }).eq("nome", nome);

  if (error) {
    return { error: `Não foi possível atualizar o destaque: ${error.message}` };
  }

  revalidatePath("/admin/produtos");
  return {};
}

// Ordem: apaga o produto (o banco apaga em cascata as fotos extras e os
// itens de Cento) e só depois os arquivos da pasta galeria/{id}/. Se
// apagar os arquivos falhar, o produto já saiu: devolve um aviso para a
// listagem e registra no log. A capa continua no storage, como antes.
export async function deleteProduto(nome: string): Promise<{ aviso?: string }> {
  await requireAuth();

  const supabase = await createClient();
  const { data: produto } = await supabase
    .from("produtos")
    .select("id")
    .eq("nome", nome)
    .maybeSingle<{ id: string }>();

  const { error } = await supabase.from("produtos").delete().eq("nome", nome);

  if (error) {
    throw new Error(`Não foi possível excluir o produto: ${error.message}`);
  }

  revalidatePath("/admin/produtos");

  if (produto && ehUuid(produto.id)) {
    try {
      await apagarPastaDoProduto(produto.id);
    } catch (erro) {
      console.error("Galeria: falha ao apagar a pasta do produto excluído", produto.id, erro);
      return { aviso: "Produto excluído, mas algumas fotos extras não puderam ser apagadas do armazenamento. Avise o suporte." };
    }
  }
  return {};
}

// Passo 1 do Salvar com fotos novas: autoriza o navegador a subir cada foto
// para um caminho escolhido aqui (galeria/{id}/{uuid}.webp|jpg). Nada é
// gravado no banco.
export async function prepararEnvioFotos(
  produtoId: string,
  extensoes: string[]
): Promise<{ envios?: EnvioAssinado[]; error?: string }> {
  await requireAuth();

  if (!ehUuid(produtoId)) return { error: "Formulário inválido. Recarregue a página e tente de novo." };
  if (!Array.isArray(extensoes) || extensoes.length > 9) return { error: MENSAGEM_LIMITE_SERVIDOR };
  if (!extensoes.every(ehExtensaoFoto)) return { error: "A foto precisa ser JPG ou WebP." };

  try {
    return { envios: await criarEnviosAssinados(produtoId, extensoes) };
  } catch (erro) {
    console.error("Galeria: falha ao autorizar envio de fotos", produtoId, erro);
    return { error: "Não foi possível preparar o envio das fotos. Tente de novo." };
  }
}

// Chamado pelo navegador quando o envio de uma foto falha no meio: apaga
// da pasta do produto o que já tinha subido nesta tentativa (todo arquivo
// sem linha no banco).
export async function descartarEnviosFotos(produtoId: string): Promise<void> {
  await requireAuth();
  if (!ehUuid(produtoId)) return;
  const supabase = await createClient();
  await limparSobras(supabase, produtoId);
}
