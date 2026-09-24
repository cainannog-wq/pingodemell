import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { MENSAGEM_LIMITE_SERVIDOR, montarCaminho, type ItemGaleria } from "@/lib/galeria/regras";
import { limparArquivosSemLinha } from "@/lib/galeria/storage-servidor";

// Passos da galeria de fotos extras usados pelas Server Actions de
// produto (actions.ts). Leitura e gravação das linhas usam a sessão do
// admin (RLS de produto_fotos vale); os arquivos usam storage-servidor.ts.

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type LinhaFoto = { id: string; caminho: string };

export async function lerFotosAtuais(supabase: Supabase, produtoId: string): Promise<LinhaFoto[] | null> {
  const { data, error } = await supabase
    .from("produto_fotos")
    .select("id, caminho")
    .eq("produto_id", produtoId)
    .order("posicao", { ascending: true });
  if (error) {
    console.error("Galeria: falha ao ler as fotos atuais de", produtoId, error.message);
    return null;
  }
  return (data ?? []) as LinhaFoto[];
}

// A galeria mudou se entrou foto nova ou se a lista de ids (na ordem)
// não é a mesma que está no banco.
export function galeriaMudou(itens: ItemGaleria[], atuais: LinhaFoto[]): boolean {
  if (itens.some((item) => "novo" in item)) return true;
  if (itens.length !== atuais.length) return true;
  return itens.some((item, i) => "id" in item && item.id !== atuais[i].id);
}

// Formato esperado por salvar_produto_fotos: a foto que já existe vai pelo
// id; a nova, pelo caminho montado aqui no servidor.
export function itensParaGravar(produtoId: string, itens: ItemGaleria[]) {
  return itens.map((item) => ("id" in item ? { id: item.id } : { caminho: montarCaminho(produtoId, item.novo, item.ext) }));
}

function traduzirErro(mensagem: string) {
  if (mensagem.includes("Limite de 9")) return MENSAGEM_LIMITE_SERVIDOR;
  if (mensagem.includes("não pertence a este produto")) {
    return "Uma das fotos não pertence mais a este produto. Recarregue a página e tente de novo.";
  }
  return mensagem;
}

// Grava a lista final numa única transação do banco (apaga removidas,
// reposiciona, insere novas). Em caso de erro nada muda na galeria.
export async function gravarGaleria(supabase: Supabase, produtoId: string, itens: ItemGaleria[]): Promise<string | null> {
  const { error } = await supabase.rpc("salvar_produto_fotos", {
    p_produto_id: produtoId,
    p_fotos: itensParaGravar(produtoId, itens),
  });
  return error ? traduzirErro(error.message) : null;
}

// Apaga da pasta do produto os arquivos sem linha no banco. Nunca lança e
// nunca mostra nada ao admin: se falhar, só registra no log (o próximo
// Salvar que mexer na galeria tenta de novo). Se não conseguir ler as
// linhas, não apaga nada — sem a lista do banco, apagar seria às cegas.
export async function limparSobras(supabase: Supabase, produtoId: string): Promise<void> {
  try {
    const linhas = await lerFotosAtuais(supabase, produtoId);
    if (linhas === null) return;
    await limparArquivosSemLinha(
      produtoId,
      linhas.map((linha) => linha.caminho)
    );
  } catch (erro) {
    console.error("Galeria: falha ao limpar arquivos sem linha de", produtoId, erro);
  }
}
