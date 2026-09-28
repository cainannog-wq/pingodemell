"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/supabase/dal";
import { parseProdutoForm } from "@/lib/produtos/parse";
import {
  MENSAGEM_LIMITE_SERVIDOR,
  ehExtensaoFoto,
  ehUuid,
  lerGaleria,
  type ExtensaoFoto,
  type ItemGaleria,
} from "@/lib/galeria/regras";
import { lerCapaNova, type CapaNova } from "@/lib/galeria/capa";
import {
  criarEnvioCapa,
  criarEnviosAssinados,
  urlDaCapa,
  verificarArquivosNovos,
  verificarCapaNova,
  type EnvioAssinado,
} from "@/lib/galeria/storage-servidor";
import { galeriaMudou, gravarGaleria, lerFotosAtuais, limparSobras } from "./galeria-servidor";
import { apagarArquivosDoProduto, concluirTrocaDeCapa, limparSobrasCapa } from "./capa-servidor";

export type ProdutoFormState = {
  error?: string;
};

const MENSAGEM_FORMULARIO_INVALIDO = "Formulário inválido. Recarregue a página e tente de novo.";

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

// Arquivos que o navegador já subiu antes de chamar a Server Action. Se o
// Salvar for recusado antes de gravar o produto, descartar() apaga das
// pastas do produto tudo o que não está gravado no banco (o que já estava
// salvo continua). Campo ilegível conta como "pode ter subido".
function arquivosDoEnvio(
  supabase: Awaited<ReturnType<typeof createClient>>,
  produtoId: string,
  galeriaBruta: FormDataEntryValue | null,
  capaBruta: FormDataEntryValue | null
) {
  const galeria = lerGaleria(galeriaBruta);
  const capaLida = lerCapaNova(capaBruta);
  const subiuGaleria = !galeria.ok || fotosNovas(galeria.itens).length > 0;
  const capa: CapaNova | null = capaLida.ok ? capaLida.capa : null;
  const subiuCapa = !capaLida.ok || capa !== null;

  async function descartar(galeriaTambem = subiuGaleria, capaTambem = subiuCapa) {
    await Promise.all([
      galeriaTambem ? limparSobras(supabase, produtoId) : undefined,
      capaTambem ? limparSobrasCapa(supabase, produtoId) : undefined,
    ]);
  }

  return { galeria, capaValida: capaLida.ok, capa, descartar };
}

// Salvar (cadastro), na ordem:
// 1. o navegador já subiu a capa nova (capa/{id}/) e as fotos extras novas
//    (galeria/{id}/), nos caminhos autorizados por prepararEnvioFotos —
//    nada foi gravado no banco ainda;
// 2. aqui o servidor confere os arquivos novos (existem, até 2 MB, tipo real);
// 3. grava o produto, já com a capa nova em image_url;
// 4. limpa capa/{id}/ (só a capa gravada fica);
// 5. subitens do Cento;
// 6. grava a galeria inteira numa transação (salvar_produto_fotos);
// 7. apaga de galeria/{id}/ todo arquivo sem linha no banco.
// Recusa antes de 3: nada gravado, arquivos novos apagados. Falha em 5 ou
// 6: produto salvo (com a capa), galeria como estava. Falha de limpeza:
// só vai para o log.
export async function createProduto(
  _prevState: ProdutoFormState,
  formData: FormData
): Promise<ProdutoFormState> {
  await requireAuth();

  // O id do produto novo vem do formulário (gerado no servidor pela
  // página) porque capa e fotos extras sobem antes de o produto existir.
  const produtoId = formData.get("id");
  if (!ehUuid(produtoId)) return { error: MENSAGEM_FORMULARIO_INVALIDO };

  const supabase = await createClient();
  const { galeria, capaValida, capa, descartar } = arquivosDoEnvio(
    supabase,
    produtoId,
    formData.get("galeria"),
    formData.get("capa")
  );

  const parsed = parseProdutoForm(formData);
  if (!parsed.success) {
    await descartar();
    return { error: parsed.error };
  }
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

  if (!galeria.ok) {
    await descartar();
    return { error: galeria.erro };
  }
  if (galeria.itens.some((item) => "id" in item)) {
    await descartar();
    return { error: "Lista de fotos extras inválida." };
  }
  if (!capaValida) {
    await descartar();
    return { error: MENSAGEM_FORMULARIO_INVALIDO };
  }
  const novas = fotosNovas(galeria.itens);

  const { data: existing } = await supabase
    .from("produtos")
    .select("nome")
    .eq("nome", nome)
    .maybeSingle();

  if (existing) {
    await descartar();
    return { error: "Já existe um produto cadastrado com esse nome." };
  }

  const erroArquivos = (await verificarArquivosNovos(produtoId, novas)) ?? (capa ? await verificarCapaNova(produtoId, capa) : null);
  if (erroArquivos) {
    await descartar();
    return { error: erroArquivos };
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
    image_url: capa ? urlDaCapa(produtoId, capa) : null,
  });

  if (error) {
    await descartar();
    return { error: `Não foi possível salvar o produto: ${error.message}` };
  }

  if (capa) await limparSobrasCapa(supabase, produtoId);

  if (tipo === "cento") {
    const subitensError = await salvarSubitensCento(supabase, nome, subitens);
    if (subitensError) {
      await descartar(novas.length > 0, false);
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

// Salvar (edição), na mesma ordem do cadastro. Com capa nova: a capa
// antiga (lida do banco antes da troca) só é apagada depois de o produto
// ter sido gravado com a nova; se a gravação falhar, a antiga continua e a
// nova é apagada.
export async function updateProduto(
  nomeOriginal: string,
  _prevState: ProdutoFormState,
  formData: FormData
): Promise<ProdutoFormState> {
  await requireAuth();

  const supabase = await createClient();

  const { data: atual } = await supabase
    .from("produtos")
    .select("id, image_url")
    .eq("nome", nomeOriginal)
    .maybeSingle<{ id: string; image_url: string | null }>();
  if (!atual || !ehUuid(atual.id)) return { error: "Produto não encontrado. Ele pode ter sido excluído ou renomeado." };
  const produtoId = atual.id;
  const capaAntiga = atual.image_url ?? null;

  const { galeria, capaValida, capa, descartar } = arquivosDoEnvio(
    supabase,
    produtoId,
    formData.get("galeria"),
    formData.get("capa")
  );

  const parsed = parseProdutoForm(formData);
  if (!parsed.success) {
    await descartar();
    return { error: parsed.error };
  }
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

  if (!capaValida) {
    await descartar();
    return { error: MENSAGEM_FORMULARIO_INVALIDO };
  }

  if (nome !== nomeOriginal) {
    const { data: existing } = await supabase
      .from("produtos")
      .select("nome")
      .eq("nome", nome)
      .maybeSingle();

    if (existing) {
      await descartar();
      return { error: "Já existe um produto cadastrado com esse nome." };
    }
  }

  // Sem o campo "galeria" no formulário, a galeria não é tocada. Com ele,
  // só é regravada se mudou (foto nova, removida ou ordem diferente).
  let itensGaleria: ItemGaleria[] | null = null;
  if (formData.has("galeria")) {
    if (!galeria.ok) {
      await descartar();
      return { error: galeria.erro };
    }
    const atuais = await lerFotosAtuais(supabase, produtoId);
    if (atuais === null) {
      await descartar();
      return { error: "Não foi possível ler as fotos extras atuais. Tente de novo." };
    }
    if (galeriaMudou(galeria.itens, atuais)) itensGaleria = galeria.itens;
  }
  const novas = itensGaleria ? fotosNovas(itensGaleria) : [];

  const erroArquivos = (await verificarArquivosNovos(produtoId, novas)) ?? (capa ? await verificarCapaNova(produtoId, capa) : null);
  if (erroArquivos) {
    await descartar();
    return { error: erroArquivos };
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
  if (capa) update.image_url = urlDaCapa(produtoId, capa);

  const { error } = await supabase
    .from("produtos")
    .update(update)
    .eq("id", produtoId);

  if (error) {
    await descartar();
    return { error: `Não foi possível salvar o produto: ${error.message}` };
  }

  // A troca de capa já está gravada: a antiga sai do storage agora,
  // aconteça o que acontecer com subitens e galeria.
  if (capa) await concluirTrocaDeCapa(supabase, produtoId, capaAntiga);

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

// Ordem: lê o id e a capa gravada, apaga o produto (o banco apaga em
// cascata as fotos extras e os itens de Cento) e só depois os arquivos:
// pasta galeria/{id}/, a capa (raiz ou capa/{id}/, só se nenhuma outra
// linha usar o arquivo) e a pasta capa/{id}/. Se apagar algum arquivo
// falhar, o produto já saiu: devolve um aviso para a listagem e registra
// no log.
export async function deleteProduto(nome: string): Promise<{ aviso?: string }> {
  await requireAuth();

  const supabase = await createClient();
  const { data: produto } = await supabase
    .from("produtos")
    .select("id, image_url")
    .eq("nome", nome)
    .maybeSingle<{ id: string; image_url: string | null }>();

  const { error } = await supabase.from("produtos").delete().eq("nome", nome);

  if (error) {
    throw new Error(`Não foi possível excluir o produto: ${error.message}`);
  }

  revalidatePath("/admin/produtos");

  if (produto && ehUuid(produto.id)) {
    const tudoApagado = await apagarArquivosDoProduto(produto.id, produto.image_url ?? null);
    if (!tudoApagado) {
      return { aviso: "Produto excluído, mas algumas fotos não puderam ser apagadas do armazenamento. Avise o suporte." };
    }
  }
  return {};
}

// Passo 1 do Salvar com fotos novas: autoriza o navegador a subir cada foto
// extra (galeria/{id}/{uuid}.webp|jpg) e, se veio extensão da capa, a capa
// nova (capa/{id}/{uuid}.webp|jpg), numa ida só ao servidor. Os caminhos são
// escolhidos aqui. Nada é gravado no banco.
export async function prepararEnvioFotos(
  produtoId: string,
  extensoes: string[],
  extensaoCapa?: string | null
): Promise<{ envios?: EnvioAssinado[]; capa?: EnvioAssinado; error?: string }> {
  await requireAuth();

  if (!ehUuid(produtoId)) return { error: MENSAGEM_FORMULARIO_INVALIDO };
  if (!Array.isArray(extensoes) || extensoes.length > 9) return { error: MENSAGEM_LIMITE_SERVIDOR };
  if (!extensoes.every(ehExtensaoFoto)) return { error: "A foto precisa ser JPG ou WebP." };
  if (extensaoCapa !== undefined && extensaoCapa !== null && !ehExtensaoFoto(extensaoCapa)) {
    return { error: MENSAGEM_FORMULARIO_INVALIDO };
  }

  try {
    const envios = await criarEnviosAssinados(produtoId, extensoes);
    if (!extensaoCapa) return { envios };
    return { envios, capa: await criarEnvioCapa(produtoId, extensaoCapa) };
  } catch (erro) {
    console.error("Fotos: falha ao autorizar envio", produtoId, erro);
    return { error: "Não foi possível preparar o envio das fotos. Tente de novo." };
  }
}

// Chamado pelo navegador quando o envio de uma foto falha no meio: apaga
// das pastas do produto o que já tinha subido nesta tentativa (todo
// arquivo que não está gravado no banco).
export async function descartarEnviosFotos(produtoId: string): Promise<void> {
  await requireAuth();
  if (!ehUuid(produtoId)) return;
  const supabase = await createClient();
  await Promise.all([limparSobras(supabase, produtoId), limparSobrasCapa(supabase, produtoId)]);
}
