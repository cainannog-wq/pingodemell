import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { supabaseUrl } from "@/lib/supabase/env";
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
import {
  MENSAGEM_CAPA_NAO_CHEGOU,
  MENSAGEM_CAPA_PREPARO,
  MENSAGEM_CAPA_TAMANHO,
  caminhoCapaNaPasta,
  caminhoDaCapa,
  caminhoNoBucket,
  montarCaminhoCapa,
  pastaDaCapa,
  type CapaNova,
} from "./capa";

// Operações das fotos do produto no storage que usam a chave de serviço
// (fotos extras em galeria/{id}/, capa em capa/{id}/ ou, nas capas
// antigas, na raiz). Regras que valem para TODAS as funções deste arquivo:
// - só são chamadas por Server Actions que já conferiram o login
//   (requireAuth) antes;
// - recebem o id do produto (validado como uuid) e, no caso da capa, o
//   endereço gravado no banco; montam ou derivam o caminho aqui mesmo —
//   nunca recebem um caminho pronto do navegador;
// - só agem dentro da pasta do produto (galeria/{id}/ ou capa/{id}/) ou
//   num arquivo solto da raiz que é a capa gravada daquele produto: o que
//   não passa nessas conferências é recusado ou ignorado.
// Nenhuma política de storage é usada nem alterada: a chave de serviço
// ignora a RLS de storage.objects.

// Uma pasta de fotos do produto: onde fica e como é um caminho válido nela.
type Area = {
  pasta: (produtoId: string) => string;
  dentro: (produtoId: string, caminho: string) => boolean;
  montar: (produtoId: string, arquivoId: string, extensao: ExtensaoFoto) => string;
};

const GALERIA: Area = { pasta: pastaDoProduto, dentro: caminhoDentroDaPasta, montar: montarCaminho };
const CAPA: Area = { pasta: pastaDaCapa, dentro: caminhoCapaNaPasta, montar: montarCaminhoCapa };

type ArquivoNaPasta = { caminho: string; bytes: number | null };

async function listarPasta(area: Area, produtoId: string): Promise<ArquivoNaPasta[]> {
  const pasta = area.pasta(produtoId);
  const { data, error } = await createAdminClient().storage.from(BUCKET_FOTOS).list(pasta, { limit: 1000 });
  if (error) throw new Error(`Falha ao listar ${pasta}: ${error.message}`);

  return (data ?? [])
    .map((item) => ({
      caminho: `${pasta}/${item.name}`,
      bytes: typeof item.metadata?.size === "number" ? item.metadata.size : null,
    }))
    .filter((arquivo) => area.dentro(produtoId, arquivo.caminho));
}

async function apagar(area: Area, produtoId: string, caminhos: string[]) {
  const seguros = caminhos.filter((caminho) => area.dentro(produtoId, caminho));
  if (seguros.length !== caminhos.length) throw new Error("Caminho fora da pasta do produto recusado.");
  if (seguros.length === 0) return;
  const { error } = await createAdminClient().storage.from(BUCKET_FOTOS).remove(seguros);
  if (error) throw new Error(`Falha ao apagar arquivos: ${error.message}`);
}

async function limparPasta(area: Area, produtoId: string, manter: Iterable<string>): Promise<number> {
  const guardar = new Set(manter);
  const sobrando = (await listarPasta(area, produtoId))
    .map((arquivo) => arquivo.caminho)
    .filter((caminho) => !guardar.has(caminho));
  await apagar(area, produtoId, sobrando);
  return sobrando.length;
}

export type EnvioAssinado = { novo: string; ext: ExtensaoFoto; caminho: string; token: string };

// O servidor escolhe o nome do arquivo e devolve um token que só vale para
// aquele caminho exato. O navegador sobe o arquivo direto para o storage
// com esse token (uploadToSignedUrl), sem passar pelo limite de tamanho da
// Server Action.
async function assinar(area: Area, produtoId: string, ext: ExtensaoFoto): Promise<EnvioAssinado> {
  if (!ehExtensaoFoto(ext)) throw new Error("Formato de arquivo inválido.");
  const novo = crypto.randomUUID();
  const caminho = area.montar(produtoId, novo, ext);
  const { data, error } = await createAdminClient().storage.from(BUCKET_FOTOS).createSignedUploadUrl(caminho);
  if (error || !data) throw new Error(`Falha ao autorizar o envio: ${error?.message ?? "sem resposta"}`);
  return { novo, ext, caminho, token: data.token };
}

type Mensagens = { naoChegou: string; tamanho: string; naoConferiu: string; tipo: string };

// Confere um arquivo novo que o navegador disse ter subido: existe na
// pasta, tem até 2 MB e o tipo real (pelos primeiros bytes) bate com a
// extensão. Devolve a mensagem de erro, ou null se tudo certo.
async function conferir(
  caminho: string,
  ext: ExtensaoFoto,
  naPasta: Map<string, number | null>,
  mensagens: Mensagens
): Promise<string | null> {
  if (!naPasta.has(caminho)) return mensagens.naoChegou;

  const bytes = naPasta.get(caminho);
  if (bytes === null || bytes === undefined || bytes > MAX_BYTES_FOTO) return mensagens.tamanho;

  const { data } = createAdminClient().storage.from(BUCKET_FOTOS).getPublicUrl(caminho);
  const resposta = await fetch(data.publicUrl, { headers: { Range: "bytes=0-15" }, cache: "no-store" });
  if (!resposta.ok) return mensagens.naoConferiu;
  const inicio = new Uint8Array(await resposta.arrayBuffer()).slice(0, 16);
  if (tipoPelosBytes(inicio) !== ext) return mensagens.tipo;
  return null;
}

// ---- Fotos extras (galeria/{id}/) ----

export async function criarEnviosAssinados(produtoId: string, extensoes: ExtensaoFoto[]): Promise<EnvioAssinado[]> {
  if (extensoes.length > MAX_FOTOS_EXTRAS) throw new Error("Quantidade de fotos acima do limite.");
  const envios: EnvioAssinado[] = [];
  for (const ext of extensoes) envios.push(await assinar(GALERIA, produtoId, ext));
  return envios;
}

const MENSAGENS_GALERIA: Mensagens = {
  naoChegou: "Uma das fotos novas não chegou ao armazenamento. Tente salvar de novo.",
  tamanho: "Cada foto extra precisa ter até 2 MB.",
  naoConferiu: "Não foi possível conferir uma das fotos novas. Tente salvar de novo.",
  tipo: "A foto precisa ser JPG ou WebP.",
};

export async function verificarArquivosNovos(
  produtoId: string,
  novos: { novo: string; ext: ExtensaoFoto }[]
): Promise<string | null> {
  if (novos.length === 0) return null;

  const naPasta = new Map((await listarPasta(GALERIA, produtoId)).map((arquivo) => [arquivo.caminho, arquivo.bytes]));
  for (const { novo, ext } of novos) {
    const erro = await conferir(montarCaminho(produtoId, novo, ext), ext, naPasta, MENSAGENS_GALERIA);
    if (erro) return erro;
  }
  return null;
}

// Apaga da pasta do produto todo arquivo que não tem linha em
// produto_fotos: fotos removidas no Salvar, fotos novas de um Salvar que
// falhou e sobras de uma aba fechada no meio do Salvar. Devolve quantos
// arquivos apagou. Lança em caso de falha (quem chama só registra no log).
export async function limparArquivosSemLinha(produtoId: string, caminhosComLinha: Iterable<string>): Promise<number> {
  return limparPasta(GALERIA, produtoId, caminhosComLinha);
}

// Exclusão do produto: apaga todos os arquivos da pasta de fotos extras.
export async function apagarPastaDoProduto(produtoId: string): Promise<number> {
  return limparPasta(GALERIA, produtoId, []);
}

// ---- Capa (capa/{id}/; capas antigas na raiz) ----

export async function criarEnvioCapa(produtoId: string, ext: ExtensaoFoto): Promise<EnvioAssinado> {
  return assinar(CAPA, produtoId, ext);
}

const MENSAGENS_CAPA: Mensagens = {
  naoChegou: MENSAGEM_CAPA_NAO_CHEGOU,
  tamanho: MENSAGEM_CAPA_TAMANHO,
  naoConferiu: "Não foi possível conferir a foto de capa. Tente salvar de novo.",
  tipo: MENSAGEM_CAPA_PREPARO,
};

export async function verificarCapaNova(produtoId: string, capa: CapaNova): Promise<string | null> {
  const caminho = montarCaminhoCapa(produtoId, capa.novo, capa.ext);
  const naPasta = new Map((await listarPasta(CAPA, produtoId)).map((arquivo) => [arquivo.caminho, arquivo.bytes]));
  return conferir(caminho, capa.ext, naPasta, MENSAGENS_CAPA);
}

// Endereço público de uma capa nova — o que vai para produtos.image_url.
export function urlDaCapa(produtoId: string, capa: CapaNova): string {
  const caminho = montarCaminhoCapa(produtoId, capa.novo, capa.ext);
  return createAdminClient().storage.from(BUCKET_FOTOS).getPublicUrl(caminho).data.publicUrl;
}

// Apaga de capa/{id}/ todo arquivo que não seja a capa gravada no banco
// (imageUrlAtual, lida do banco por quem chama; null = nenhuma). Cobre a
// capa nova de um Salvar que falhou, a antiga depois da troca e a aba
// fechada no meio do Salvar. Lança em caso de falha.
export async function limparPastaDaCapa(produtoId: string, imageUrlAtual: string | null): Promise<number> {
  const atual = caminhoDaCapa(imageUrlAtual, produtoId, supabaseUrl);
  return limparPasta(CAPA, produtoId, atual?.local === "pasta" ? [atual.caminho] : []);
}

export type ResultadoCapaAntiga = "apagada" | "sem-capa" | "caminho-recusado" | "em-uso";

// Apaga o arquivo da capa antiga de um produto, depois de a troca (ou a
// exclusão do produto) já estar gravada no banco. O caminho sai do
// endereço que estava gravado no banco para aquele produto, e só vale se
// for a raiz do bucket ou capa/{id do próprio produto}/. Antes de apagar,
// confere que nenhuma linha do banco (outro produto ou foto extra) usa o
// mesmo arquivo. Lança em caso de falha de leitura ou de exclusão.
export async function apagarCapaAntiga(produtoId: string, imageUrlAntiga: string | null): Promise<ResultadoCapaAntiga> {
  if (!imageUrlAntiga) return "sem-capa";
  const alvo = caminhoDaCapa(imageUrlAntiga, produtoId, supabaseUrl);
  if (!alvo) {
    console.error("Capa: caminho da capa antiga fora das pastas permitidas, nada apagado", produtoId, imageUrlAntiga);
    return "caminho-recusado";
  }

  const admin = createAdminClient();
  const [produtos, fotos] = await Promise.all([
    admin.from("produtos").select("id, image_url").not("image_url", "is", null),
    admin.from("produto_fotos").select("id").eq("caminho", alvo.caminho).limit(1),
  ]);
  if (produtos.error) throw new Error(`Falha ao conferir quem usa a capa: ${produtos.error.message}`);
  if (fotos.error) throw new Error(`Falha ao conferir quem usa a capa: ${fotos.error.message}`);

  const usadaPor = ((produtos.data ?? []) as { id: string; image_url: string | null }[]).filter(
    (linha) => caminhoNoBucket(linha.image_url, supabaseUrl) === alvo.caminho
  );
  if (usadaPor.length > 0 || (fotos.data ?? []).length > 0) {
    console.error("Capa: arquivo da capa antiga ainda usado por outra linha, nada apagado", produtoId, alvo.caminho, {
      produtos: usadaPor.map((linha) => linha.id),
      fotosExtras: (fotos.data ?? []).length,
    });
    return "em-uso";
  }

  const { error } = await admin.storage.from(BUCKET_FOTOS).remove([alvo.caminho]);
  if (error) throw new Error(`Falha ao apagar a capa antiga: ${error.message}`);
  return "apagada";
}
