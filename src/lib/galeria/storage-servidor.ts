import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  BUCKET_FOTOS,
  MAX_BYTES_FOTO,
  MAX_FOTOS_EXTRAS,
  caminhoDentroDaPasta,
  ehExtensaoFoto,
  montarCaminho,
  pastaDoProduto,
  tipoPelosBytes,
  type ExtensaoFoto,
} from "./regras";

// Operações da galeria no storage que usam a chave de serviço. Regras que
// valem para TODAS as funções deste arquivo:
// - só são chamadas por Server Actions que já conferiram o login
//   (requireAuth) antes;
// - recebem só o id do produto (validado como uuid em pastaDoProduto /
//   montarCaminho) e montam o caminho aqui mesmo — nunca recebem um
//   caminho pronto do navegador;
// - só agem dentro de galeria/{id}/: o que não passa em
//   caminhoDentroDaPasta é recusado ou ignorado.
// Nenhuma política de storage é usada nem alterada: a chave de serviço
// ignora a RLS de storage.objects.

type ArquivoNaPasta = { caminho: string; bytes: number | null };

async function listarPasta(produtoId: string): Promise<ArquivoNaPasta[]> {
  const pasta = pastaDoProduto(produtoId);
  const { data, error } = await createAdminClient().storage.from(BUCKET_FOTOS).list(pasta, { limit: 1000 });
  if (error) throw new Error(`Falha ao listar ${pasta}: ${error.message}`);

  return (data ?? [])
    .map((item) => ({
      caminho: `${pasta}/${item.name}`,
      bytes: typeof item.metadata?.size === "number" ? item.metadata.size : null,
    }))
    .filter((arquivo) => caminhoDentroDaPasta(produtoId, arquivo.caminho));
}

async function apagar(produtoId: string, caminhos: string[]) {
  const seguros = caminhos.filter((caminho) => caminhoDentroDaPasta(produtoId, caminho));
  if (seguros.length !== caminhos.length) throw new Error("Caminho fora da pasta do produto recusado.");
  if (seguros.length === 0) return;
  const { error } = await createAdminClient().storage.from(BUCKET_FOTOS).remove(seguros);
  if (error) throw new Error(`Falha ao apagar arquivos: ${error.message}`);
}

export type EnvioAssinado = { novo: string; ext: ExtensaoFoto; caminho: string; token: string };

// Autorização de envio para cada foto nova: o servidor escolhe o nome do
// arquivo e devolve um token que só vale para aquele caminho exato. O
// navegador sobe o arquivo direto para o storage com esse token
// (uploadToSignedUrl), sem passar pelo limite de tamanho da Server Action.
export async function criarEnviosAssinados(produtoId: string, extensoes: ExtensaoFoto[]): Promise<EnvioAssinado[]> {
  if (extensoes.length > MAX_FOTOS_EXTRAS) throw new Error("Quantidade de fotos acima do limite.");
  const storage = createAdminClient().storage.from(BUCKET_FOTOS);

  const envios: EnvioAssinado[] = [];
  for (const ext of extensoes) {
    if (!ehExtensaoFoto(ext)) throw new Error("Formato de arquivo inválido.");
    const novo = crypto.randomUUID();
    const caminho = montarCaminho(produtoId, novo, ext);
    const { data, error } = await storage.createSignedUploadUrl(caminho);
    if (error || !data) throw new Error(`Falha ao autorizar o envio: ${error?.message ?? "sem resposta"}`);
    envios.push({ novo, ext, caminho, token: data.token });
  }
  return envios;
}

// Confere, no servidor, cada foto nova que o navegador disse ter subido:
// existe na pasta, tem até 2 MB e o tipo real (pelos primeiros bytes)
// bate com a extensão. Devolve a mensagem de erro, ou null se tudo certo.
export async function verificarArquivosNovos(
  produtoId: string,
  novos: { novo: string; ext: ExtensaoFoto }[]
): Promise<string | null> {
  if (novos.length === 0) return null;

  const naPasta = new Map((await listarPasta(produtoId)).map((arquivo) => [arquivo.caminho, arquivo.bytes]));
  const storage = createAdminClient().storage.from(BUCKET_FOTOS);

  for (const { novo, ext } of novos) {
    const caminho = montarCaminho(produtoId, novo, ext);
    if (!naPasta.has(caminho)) return "Uma das fotos novas não chegou ao armazenamento. Tente salvar de novo.";

    const bytes = naPasta.get(caminho);
    if (bytes === null || bytes === undefined || bytes > MAX_BYTES_FOTO) {
      return "Cada foto extra precisa ter até 2 MB.";
    }

    const { data } = storage.getPublicUrl(caminho);
    const resposta = await fetch(data.publicUrl, { headers: { Range: "bytes=0-15" }, cache: "no-store" });
    if (!resposta.ok) return "Não foi possível conferir uma das fotos novas. Tente salvar de novo.";
    const inicio = new Uint8Array(await resposta.arrayBuffer()).slice(0, 16);
    if (tipoPelosBytes(inicio) !== ext) return "A foto precisa ser JPG ou WebP.";
  }
  return null;
}

// Apaga da pasta do produto todo arquivo que não tem linha em
// produto_fotos: fotos removidas no Salvar, fotos novas de um Salvar que
// falhou e sobras de uma aba fechada no meio do Salvar. Devolve quantos
// arquivos apagou. Lança em caso de falha (quem chama só registra no log).
export async function limparArquivosSemLinha(produtoId: string, caminhosComLinha: Iterable<string>): Promise<number> {
  const manter = new Set(caminhosComLinha);
  const sobrando = (await listarPasta(produtoId))
    .map((arquivo) => arquivo.caminho)
    .filter((caminho) => !manter.has(caminho));
  await apagar(produtoId, sobrando);
  return sobrando.length;
}

// Exclusão do produto: apaga todos os arquivos da pasta dele.
export async function apagarPastaDoProduto(produtoId: string): Promise<number> {
  return limparArquivosSemLinha(produtoId, []);
}
