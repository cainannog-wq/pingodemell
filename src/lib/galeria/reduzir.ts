import {
  MAX_BYTES_FOTO,
  MAX_BYTES_ORIGINAL,
  dimensoesReduzidas,
  type ExtensaoFoto,
} from "./regras";

// Redução de uma foto extra no navegador, antes de subir: lado maior em
// até 2000px, recodificada em WebP (ou JPEG onde o navegador não gera
// WebP), qualidade ~0,85. Recodificar pelo canvas descarta todos os
// metadados do arquivo original, inclusive a localização GPS — desejado:
// foto tirada na cozinha não publica onde fica a cozinha.
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
        return { ok: true, foto: { blob, ext, largura, altura } };
      }
    }
    return { ok: false, erro: mensagemNaoReduziu(arquivo.name) };
  } catch {
    return { ok: false, erro: mensagemIlegivel(arquivo.name) };
  } finally {
    imagem.liberar();
  }
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
