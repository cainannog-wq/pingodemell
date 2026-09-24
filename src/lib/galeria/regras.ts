// Regras da galeria de fotos extras do produto, sem dependência de
// navegador nem de servidor — usadas pelo formulário do admin, pelas
// Server Actions e pela leitura pública. Tabela: public.produto_fotos
// (ver supabase/produto-fotos.sql).

// Bucket público do storage onde ficam todas as fotos de produto (capa na
// raiz, fotos extras em galeria/{produto_id}/).
export const BUCKET_FOTOS = "Pingo de Mell";

export const MAX_FOTOS_EXTRAS = 9;

// Mesmo limite da capa (actions.ts), conferido no servidor sobre o
// arquivo já reduzido pelo navegador.
export const MAX_BYTES_FOTO = 2 * 1024 * 1024;

// Acima disso o navegador recusa antes mesmo de tentar reduzir.
export const MAX_BYTES_ORIGINAL = 20 * 1024 * 1024;

// Lado maior da foto depois da redução no navegador.
export const MAX_LADO_PX = 2000;

export const PASTA_GALERIA = "galeria";

export type ExtensaoFoto = "webp" | "jpg";

export const MENSAGEM_LIMITE =
  "Limite de 9 fotos extras atingido (10 com a capa). Remova uma foto para adicionar outra.";

export const MENSAGEM_LIMITE_SERVIDOR =
  "Limite de 9 fotos extras por produto (10 com a capa). Remova uma foto para adicionar outra.";

export const DICA_SEM_CAPA = "Sem foto de capa: no site, o card deste produto aparece sem foto.";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function ehUuid(valor: unknown): valor is string {
  return typeof valor === "string" && UUID.test(valor);
}

export function ehExtensaoFoto(valor: unknown): valor is ExtensaoFoto {
  return valor === "webp" || valor === "jpg";
}

// Pasta de um produto no bucket. O id é validado aqui: nenhuma operação
// com a chave de serviço recebe uma pasta montada fora desta função.
export function pastaDoProduto(produtoId: string): string {
  if (!ehUuid(produtoId)) throw new Error("Identificador de produto inválido.");
  return `${PASTA_GALERIA}/${produtoId}`;
}

// Caminho de uma foto extra, sempre montado no servidor a partir de dois
// uuids validados e de uma extensão da lista fechada — nunca recebido
// pronto do navegador. Mesmo formato conferido pela restrição
// produto_fotos_caminho_na_pasta no banco.
export function montarCaminho(produtoId: string, arquivoId: string, extensao: ExtensaoFoto): string {
  if (!ehUuid(arquivoId)) throw new Error("Identificador de arquivo inválido.");
  if (!ehExtensaoFoto(extensao)) throw new Error("Formato de arquivo inválido.");
  return `${pastaDoProduto(produtoId)}/${arquivoId}.${extensao}`;
}

// Confere se um caminho (ex.: vindo do banco) está dentro da pasta do
// produto, sem subpasta, sem "..", no formato {uuid}.webp|jpg.
export function caminhoDentroDaPasta(produtoId: string, caminho: string): boolean {
  if (!ehUuid(produtoId)) return false;
  const prefixo = `${PASTA_GALERIA}/${produtoId}/`;
  if (!caminho.startsWith(prefixo)) return false;
  const arquivo = caminho.slice(prefixo.length);
  const ponto = arquivo.lastIndexOf(".");
  if (ponto < 0) return false;
  return ehUuid(arquivo.slice(0, ponto)) && ehExtensaoFoto(arquivo.slice(ponto + 1));
}

// Tipo real do arquivo pelos primeiros bytes (não pelo que o navegador
// declarou). Só os dois formatos que a redução no navegador produz.
export function tipoPelosBytes(bytes: Uint8Array): ExtensaoFoto | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

// "{nome do produto}, foto {n} de {total}", contando a capa como foto 1
// quando ela existe. Sem capa, a primeira foto extra é a foto 1.
export function textoAlternativo(nomeProduto: string, numero: number, total: number): string {
  return `${nomeProduto}, foto ${numero} de ${total}`;
}

// Tamanho final mantendo a proporção, com o lado maior em no máximo
// `maxLado`. Nunca amplia uma foto pequena.
export function dimensoesReduzidas(largura: number, altura: number, maxLado = MAX_LADO_PX) {
  const maior = Math.max(largura, altura);
  if (maior <= maxLado) return { largura, altura };
  const escala = maxLado / maior;
  return {
    largura: Math.max(1, Math.round(largura * escala)),
    altura: Math.max(1, Math.round(altura * escala)),
  };
}

// Item da lista final da galeria enviada pelo formulário ao Salvar, na
// ordem final: foto que já existe (pelo id da linha) ou foto nova (pelo
// id do arquivo que o navegador subiu + extensão; o servidor monta o
// caminho).
export type ItemGaleria = { id: string } | { novo: string; ext: ExtensaoFoto };

export function lerGaleria(
  bruto: FormDataEntryValue | null
): { ok: true; itens: ItemGaleria[] } | { ok: false; erro: string } {
  if (bruto === null || bruto === "") return { ok: true, itens: [] };
  if (typeof bruto !== "string") return { ok: false, erro: "Lista de fotos extras inválida." };

  let valor: unknown;
  try {
    valor = JSON.parse(bruto);
  } catch {
    return { ok: false, erro: "Lista de fotos extras inválida." };
  }
  if (!Array.isArray(valor)) return { ok: false, erro: "Lista de fotos extras inválida." };
  if (valor.length > MAX_FOTOS_EXTRAS) return { ok: false, erro: MENSAGEM_LIMITE_SERVIDOR };

  const itens: ItemGaleria[] = [];
  const vistos = new Set<string>();
  for (const item of valor) {
    if (item && typeof item === "object" && "id" in item && ehUuid(item.id)) {
      if (vistos.has(item.id)) return { ok: false, erro: "Lista de fotos extras inválida." };
      vistos.add(item.id);
      itens.push({ id: item.id });
    } else if (item && typeof item === "object" && "novo" in item && ehUuid(item.novo) && ehExtensaoFoto(item.ext)) {
      if (vistos.has(item.novo)) return { ok: false, erro: "Lista de fotos extras inválida." };
      vistos.add(item.novo);
      itens.push({ novo: item.novo, ext: item.ext });
    } else {
      return { ok: false, erro: "Lista de fotos extras inválida." };
    }
  }
  return { ok: true, itens };
}
