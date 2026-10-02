import { BUCKET_FOTOS, ehExtensaoFoto, ehUuid, type ExtensaoFoto } from "./regras";

// Regras da foto de capa do produto, sem dependência de navegador nem de
// servidor. A coluna produtos.image_url guarda o endereço público completo
// do arquivo (é o que o site e o admin mostram). Capas novas ficam em
// capa/{produto_id}/{uuid}.webp|jpg; as antigas, na raiz do bucket,
// continuam valendo como estão.

export const PASTA_CAPA = "capa";

export const MENSAGEM_CAPA_TAMANHO = "A foto de capa precisa ter até 2 MB.";

// O arquivo que chega ao servidor já foi convertido no navegador (WebP ou
// JPEG): a mensagem fala da foto escolhida, não do formato convertido.
export const MENSAGEM_CAPA_PREPARO = "Não foi possível preparar esta foto. Tente outra em JPG, PNG ou WebP.";

export const MENSAGEM_CAPA_NAO_CHEGOU = "A foto de capa não chegou ao armazenamento. Tente salvar de novo.";

export const MENSAGEM_CAPA_ENVIO = "Não foi possível enviar a foto de capa. Nada foi salvo; tente de novo.";

// Pasta das capas de um produto. O id é validado aqui: nenhuma operação
// com a chave de serviço recebe uma pasta montada fora desta função.
export function pastaDaCapa(produtoId: string): string {
  if (!ehUuid(produtoId)) throw new Error("Identificador de produto inválido.");
  return `${PASTA_CAPA}/${produtoId}`;
}

// Caminho de uma capa nova, sempre montado no servidor a partir de dois
// uuids validados e de uma extensão da lista fechada.
export function montarCaminhoCapa(produtoId: string, arquivoId: string, extensao: ExtensaoFoto): string {
  if (!ehUuid(arquivoId)) throw new Error("Identificador de arquivo inválido.");
  if (!ehExtensaoFoto(extensao)) throw new Error("Formato de arquivo inválido.");
  return `${pastaDaCapa(produtoId)}/${arquivoId}.${extensao}`;
}

// Confere se um caminho está dentro de capa/{id}/, sem subpasta, sem "..",
// no formato {uuid}.webp|jpg.
export function caminhoCapaNaPasta(produtoId: string, caminho: string): boolean {
  if (!ehUuid(produtoId)) return false;
  const prefixo = `${PASTA_CAPA}/${produtoId}/`;
  if (!caminho.startsWith(prefixo)) return false;
  const arquivo = caminho.slice(prefixo.length);
  const ponto = arquivo.lastIndexOf(".");
  if (ponto < 0) return false;
  return ehUuid(arquivo.slice(0, ponto)) && ehExtensaoFoto(arquivo.slice(ponto + 1));
}

// Nome de arquivo solto na raiz do bucket, como as capas gravadas antes
// desta pasta existir (ex.: 1789145949408-yesulbv5v0k.jpg,
// imagem_2026-08-31_163143635.png). Sem barra, sem "..".
const ARQUIVO_NA_RAIZ = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function prefixoPublico(baseUrl: string) {
  return `${baseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${encodeURIComponent(BUCKET_FOTOS)}/`;
}

// Caminho do arquivo dentro do bucket a partir do endereço público
// gravado no banco, ou null se o endereço não for de um arquivo deste
// bucket neste projeto.
export function caminhoNoBucket(url: string | null | undefined, baseUrl: string): string | null {
  if (typeof url !== "string") return null;
  const prefixo = prefixoPublico(baseUrl);
  if (!url.startsWith(prefixo)) return null;
  const resto = url.slice(prefixo.length);
  if (resto === "" || /[?#]/.test(resto)) return null;
  try {
    return decodeURIComponent(resto);
  } catch {
    return null;
  }
}

export type CaminhoCapa = { caminho: string; local: "raiz" | "pasta" };

// Caminho da capa de um produto que o servidor aceita apagar: a raiz do
// bucket (capas antigas) ou capa/{id do próprio produto}/. Qualquer outra
// coisa (galeria/, pasta de outro produto, "..", outro bucket ou outro
// site) devolve null — e nada é apagado.
export function caminhoDaCapa(url: string | null | undefined, produtoId: string, baseUrl: string): CaminhoCapa | null {
  const caminho = caminhoNoBucket(url, baseUrl);
  if (caminho === null) return null;
  if (caminhoCapaNaPasta(produtoId, caminho)) return { caminho, local: "pasta" };
  if (ARQUIVO_NA_RAIZ.test(caminho) && !caminho.includes("..")) return { caminho, local: "raiz" };
  return null;
}

// Capa nova enviada pelo formulário ao Salvar: só o id do arquivo que o
// navegador subiu e a extensão (o servidor monta o caminho). Sem o campo,
// a capa não muda.
export type CapaNova = { novo: string; ext: ExtensaoFoto };

export function lerCapaNova(bruto: FormDataEntryValue | null): { ok: true; capa: CapaNova | null } | { ok: false } {
  if (bruto === null || bruto === "") return { ok: true, capa: null };
  if (typeof bruto !== "string") return { ok: false };
  let valor: unknown;
  try {
    valor = JSON.parse(bruto);
  } catch {
    return { ok: false };
  }
  if (valor && typeof valor === "object" && "novo" in valor && "ext" in valor && ehUuid(valor.novo) && ehExtensaoFoto(valor.ext)) {
    return { ok: true, capa: { novo: valor.novo, ext: valor.ext } };
  }
  return { ok: false };
}
