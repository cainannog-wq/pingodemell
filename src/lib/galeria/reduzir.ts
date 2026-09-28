import {
  MAX_BYTES_FOTO,
  MAX_BYTES_ORIGINAL,
  dimensoesReduzidas,
  type ExtensaoFoto,
} from "./regras";

// Redução de uma foto (capa ou extra) no navegador, antes de subir: lado
// maior em até 2000px, recodificada em WebP (ou JPEG onde o navegador não
// gera WebP), qualidade ~0,85. Recodificar pelo canvas descarta todos os
// metadados do arquivo original, inclusive a localização GPS — desejado:
// foto tirada na cozinha não publica onde fica a cozinha. O Safari do
// iPhone (que não gera WebP) ainda escreve no JPEG um bloco técnico
// próprio (Exif com espaço de cor e dimensões, IPTC vazio); esses blocos
// saem em semMetadadosJpeg antes do envio.
//
// A decodificação e a codificação ficam num "motor" injetável: no
// navegador, <img> + <canvas>; nos testes automatizados, um motor falso
// (o ambiente de teste não tem canvas).

export type ImagemDecodificada = {
  largura: number;
  altura: number;
  liberar: () => void;
};

export type MotorImagem = {
  // Rejeita se o navegador não consegue abrir o formato (ex.: HEIC fora do
  // Safari). Largura/altura já com a orientação da câmera aplicada.
  decodificar: (arquivo: Blob) => Promise<ImagemDecodificada>;
  codificar: (
    imagem: ImagemDecodificada,
    largura: number,
    altura: number,
    tipo: "image/webp" | "image/jpeg",
    qualidade: number
  ) => Promise<Blob | null>;
};

export type FotoReduzida = {
  blob: Blob;
  ext: ExtensaoFoto;
  largura: number;
  altura: number;
};

export type ResultadoReducao = { ok: true; foto: FotoReduzida } | { ok: false; erro: string };

// Qualidade inicial e as tentativas seguintes, se ainda passar de 2 MB.
const QUALIDADES = [0.85, 0.75, 0.65];

export function mensagemMuitoGrande(nomeArquivo: string) {
  return `A foto "${nomeArquivo}" tem mais de 20 MB. Escolha uma foto menor (no celular, compartilhe ou exporte a foto em tamanho menor) e tente de novo.`;
}

export function mensagemIlegivel(nomeArquivo: string) {
  return `Não foi possível abrir a foto "${nomeArquivo}" neste navegador. Use uma foto JPG, PNG ou WebP. No iPhone, em Ajustes > Câmera > Formatos, escolha "Mais Compatível", ou abra o admin pelo Safari.`;
}

export function mensagemNaoReduziu(nomeArquivo: string) {
  return `Não foi possível deixar a foto "${nomeArquivo}" com menos de 2 MB. Escolha outra foto.`;
}

export async function reduzirFoto(arquivo: File, motor: MotorImagem = motorDoNavegador()): Promise<ResultadoReducao> {
  if (arquivo.size > MAX_BYTES_ORIGINAL) {
    return { ok: false, erro: mensagemMuitoGrande(arquivo.name) };
  }

  let imagem: ImagemDecodificada;
  try {
    imagem = await motor.decodificar(arquivo);
  } catch {
    return { ok: false, erro: mensagemIlegivel(arquivo.name) };
  }
  if (!imagem.largura || !imagem.altura) {
    imagem.liberar();
    return { ok: false, erro: mensagemIlegivel(arquivo.name) };
  }

  const { largura, altura } = dimensoesReduzidas(imagem.largura, imagem.altura);

  try {
    // Descobre uma vez se o navegador gera WebP de verdade (alguns
    // devolvem PNG quando não sabem gerar WebP).
    const teste = await motor.codificar(imagem, largura, altura, "image/webp", QUALIDADES[0]);
    const usaWebp = teste !== null && teste.type === "image/webp";
    const tipo = usaWebp ? "image/webp" : "image/jpeg";
    const ext: ExtensaoFoto = usaWebp ? "webp" : "jpg";

    for (const [i, qualidade] of QUALIDADES.entries()) {
      const blob = i === 0 && usaWebp ? teste : await motor.codificar(imagem, largura, altura, tipo, qualidade);
      if (blob && blob.type === tipo && blob.size <= MAX_BYTES_FOTO) {
        const final = ext === "jpg" ? await semMetadadosJpeg(blob) : blob;
        return { ok: true, foto: { blob: final, ext, largura, altura } };
      }
    }
    return { ok: false, erro: mensagemNaoReduziu(arquivo.name) };
  } catch {
    return { ok: false, erro: mensagemIlegivel(arquivo.name) };
  } finally {
    imagem.liberar();
  }
}

// Tira de um JPEG os blocos de metadados (APP1 a APP15: Exif, XMP, IPTC,
// perfis do fabricante; e comentários), mantendo o APP0 (JFIF) e tudo o
// que é imagem. Se o arquivo não tiver a estrutura esperada, devolve o
// mesmo arquivo (o que sobe continua sendo a foto recodificada pelo canvas).
export async function semMetadadosJpeg(blob: Blob): Promise<Blob> {
  const b = new Uint8Array(await blob.arrayBuffer());
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return blob;

  const partes: Uint8Array[] = [b.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return blob;
    const marcador = b[i + 1];
    if (marcador === 0xda) {
      // Início dos dados da imagem: daqui até o fim fica como está.
      partes.push(b.subarray(i));
      return new Blob(partes as BlobPart[], { type: blob.type });
    }
    const tamanho = (b[i + 2] << 8) | b[i + 3];
    if (tamanho < 2 || i + 2 + tamanho > b.length) return blob;
    const metadado = (marcador >= 0xe1 && marcador <= 0xef) || marcador === 0xfe;
    if (!metadado) partes.push(b.subarray(i, i + 2 + tamanho));
    i += 2 + tamanho;
  }
  return blob;
}

// Motor real do navegador. <img> em vez de createImageBitmap: todo
// navegador atual aplica a orientação gravada pela câmera (EXIF) ao
// decodificar um <img> e ao desenhá-lo no canvas, então foto em pé
// continua em pé.
export function motorDoNavegador(): MotorImagem {
  return {
    async decodificar(arquivo) {
      const url = URL.createObjectURL(arquivo);
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      try {
        await img.decode();
      } catch (erro) {
        URL.revokeObjectURL(url);
        throw erro;
      }
      return Object.assign(
        { largura: img.naturalWidth, altura: img.naturalHeight, liberar: () => URL.revokeObjectURL(url) },
        { elemento: img }
      );
    },
    codificar(imagem, largura, altura, tipo, qualidade) {
      const elemento = (imagem as ImagemDecodificada & { elemento: HTMLImageElement }).elemento;
      const canvas = document.createElement("canvas");
      canvas.width = largura;
      canvas.height = altura;
      const ctx = canvas.getContext("2d");
      if (!ctx) return Promise.resolve(null);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(elemento, 0, 0, largura, altura);
      return new Promise((resolve) => canvas.toBlob(resolve, tipo, qualidade));
    },
  };
}
