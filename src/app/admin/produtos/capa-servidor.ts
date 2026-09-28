import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { apagarCapaAntiga, apagarPastaDoProduto, limparPastaDaCapa } from "@/lib/galeria/storage-servidor";

// Passos da foto de capa usados pelas Server Actions de produto
// (actions.ts). A leitura de produtos.image_url usa a sessão do admin; os
// arquivos usam storage-servidor.ts (chave de serviço). Nada aqui lança nem
// mostra aviso técnico ao admin: falha de arquivo só vai para o log.

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Capa gravada no banco agora. null em image_url = produto sem capa ou que
// ainda não existe (cadastro); ok:false = não deu para ler.
export async function lerCapaGravada(
  supabase: Supabase,
  produtoId: string
): Promise<{ ok: true; imageUrl: string | null } | { ok: false }> {
  const { data, error } = await supabase
    .from("produtos")
    .select("image_url")
    .eq("id", produtoId)
    .maybeSingle<{ image_url: string | null }>();
  if (error) {
    console.error("Capa: falha ao ler a capa gravada de", produtoId, error.message);
    return { ok: false };
  }
  return { ok: true, imageUrl: data?.image_url ?? null };
}

// Apaga de capa/{id}/ todo arquivo que não seja a capa gravada no banco.
// Se não conseguir ler o banco, não apaga nada — sem saber qual é a capa
// gravada, apagar seria às cegas.
export async function limparSobrasCapa(supabase: Supabase, produtoId: string): Promise<void> {
  try {
    const gravada = await lerCapaGravada(supabase, produtoId);
    if (!gravada.ok) return;
    await limparPastaDaCapa(produtoId, gravada.imageUrl);
  } catch (erro) {
    console.error("Capa: falha ao limpar capa/", produtoId, erro);
  }
}

// Depois de a troca de capa estar gravada no banco: apaga o arquivo da
// capa antiga (endereço lido do banco antes da troca) e limpa a pasta.
export async function concluirTrocaDeCapa(supabase: Supabase, produtoId: string, imageUrlAntiga: string | null) {
  try {
    await apagarCapaAntiga(produtoId, imageUrlAntiga);
  } catch (erro) {
    console.error("Capa: falha ao apagar a capa antiga de", produtoId, imageUrlAntiga, erro);
  }
  await limparSobrasCapa(supabase, produtoId);
}

// Exclusão do produto (a linha já saiu do banco): fotos extras, pasta da
// capa e a capa da raiz, cada uma independente da outra. Devolve false se
// alguma falhou (já registrado no log).
export async function apagarArquivosDoProduto(produtoId: string, imageUrl: string | null): Promise<boolean> {
  const etapas: [string, () => Promise<unknown>][] = [
    ["fotos extras", () => apagarPastaDoProduto(produtoId)],
    ["capa", () => apagarCapaAntiga(produtoId, imageUrl)],
    ["pasta da capa", () => limparPastaDaCapa(produtoId, null)],
  ];
  let tudoCerto = true;
  for (const [nome, etapa] of etapas) {
    try {
      await etapa();
    } catch (erro) {
      tudoCerto = false;
      console.error(`Exclusão: falha ao apagar ${nome} do produto excluído`, produtoId, erro);
    }
  }
  return tudoCerto;
}
