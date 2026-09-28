import { describe, expect, it, vi } from "vitest";
import { mensagemIlegivel, mensagemMuitoGrande, reduzirFoto, semMetadadosJpeg, type MotorImagem } from "./reduzir";
import { MAX_BYTES_FOTO } from "./regras";

// O ambiente de teste não tem canvas: o motor falso simula um navegador
// que decodifica a foto (já com a orientação da câmera aplicada, como o
// <img> faz) e gera um arquivo cujo tamanho depende da área e da
// qualidade — o bastante para provar as regras da redução. A prova com
// canvas de verdade é a foto real de celular subida pelo preview.
function motorFalso({
  largura,
  altura,
  geraWebp = true,
  bytesPorPixel = 0.25,
  ilegivel = false,
}: {
  largura: number;
  altura: number;
  geraWebp?: boolean;
  bytesPorPixel?: number;
  ilegivel?: boolean;
}) {
  const codificados: { largura: number; altura: number; tipo: string; qualidade: number }[] = [];
  const motor: MotorImagem = {
    decodificar: vi.fn(async () => {
      if (ilegivel) throw new Error("formato não suportado");
      return { largura, altura, liberar: vi.fn() };
    }),
    codificar: vi.fn(async (_img, l, a, tipo, qualidade) => {
      const tipoGerado = tipo === "image/webp" && !geraWebp ? "image/png" : tipo;
      codificados.push({ largura: l, altura: a, tipo: tipoGerado, qualidade });
      return new Blob([new Uint8Array(Math.round(l * a * bytesPorPixel * qualidade))], { type: tipoGerado });
    }),
  };
  return { motor, codificados };
}

function arquivo(nome: string, bytes: number, tipo = "image/jpeg") {
  const f = new File([new Uint8Array(0)], nome, { type: tipo });
  Object.defineProperty(f, "size", { value: bytes });
  return f;
}

// JPEG com a mesma estrutura do que o Safari do iPhone gerou na prova da
// homologação (28/09/2026): APP0 JFIF, APP1 Exif (espaço de cor e
// dimensões), APP13 IPTC vazio, depois tabelas, quadro e dados da imagem.
function segmento(marcador: number, conteudo: string) {
  const dados = new TextEncoder().encode(conteudo);
  const n = dados.length + 2;
  return [0xff, marcador, n >> 8, n & 0xff, ...dados];
}
const JPEG_DO_SAFARI = new Uint8Array([
  0xff, 0xd8,
  ...segmento(0xe0, "JFIF\0\x01\x01"),
  ...segmento(0xe1, "Exif\0\0MM\0*ColorSpace PixelXDimension 828"),
  ...segmento(0xed, "Photoshop 3.0\x008BIM"),
  ...segmento(0xfe, "comentario"),
  ...segmento(0xdb, "tabela"),
  ...segmento(0xc0, "quadro"),
  0xff, 0xda, 0x00, 0x04, 0x01, 0x02, 0x11, 0x22, 0x33, 0xff, 0xd9,
]);

describe("semMetadadosJpeg", () => {
  it("tira Exif, IPTC e comentário do JPEG do Safari e mantém JFIF, tabelas, quadro e imagem", async () => {
    const limpo = new Uint8Array(await (await semMetadadosJpeg(new Blob([JPEG_DO_SAFARI], { type: "image/jpeg" }))).arrayBuffer());
    const texto = new TextDecoder("latin1").decode(limpo);
    expect(texto).not.toContain("Exif");
    expect(texto).not.toContain("Photoshop");
    expect(texto).not.toContain("comentario");
    expect(texto).toContain("JFIF");
    expect(texto).toContain("tabela");
    expect(texto).toContain("quadro");
    expect([...limpo.slice(0, 2)]).toEqual([0xff, 0xd8]);
    expect([...limpo.slice(-2)]).toEqual([0xff, 0xd9]);
  });

  it("arquivo que não é JPEG, ou quebrado, volta como está", async () => {
    const webp = new Blob(["RIFF\0\0\0\0WEBPVP8 "], { type: "image/webp" });
    expect(await semMetadadosJpeg(webp)).toBe(webp);
    const quebrado = new Blob([JPEG_DO_SAFARI.slice(0, 12)], { type: "image/jpeg" });
    expect(await semMetadadosJpeg(quebrado)).toBe(quebrado);
  });
});

describe("reduzirFoto", () => {
  it("no navegador que só gera JPEG (Safari do iPhone), a foto sobe sem os blocos de metadados do próprio navegador", async () => {
    const motor: MotorImagem = {
      decodificar: vi.fn(async () => ({ largura: 3024, altura: 4032, liberar: vi.fn() })),
      codificar: vi.fn(async (_img, _l, _a, tipo) =>
        tipo === "image/webp" ? new Blob(["png"], { type: "image/png" }) : new Blob([JPEG_DO_SAFARI], { type: "image/jpeg" })
      ),
    };
    const r = await reduzirFoto(arquivo("IMG_0001.HEIC", 3 * 1024 * 1024), motor);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.foto.ext).toBe("jpg");
    const texto = new TextDecoder("latin1").decode(await r.foto.blob.arrayBuffer());
    expect(texto).not.toContain("Exif");
    expect(texto).not.toContain("Photoshop");
  });

  it("o que sobe é sempre a foto recodificada, nunca o arquivo original: metadados (inclusive GPS) ficam para trás", async () => {
    const { motor } = motorFalso({ largura: 4032, altura: 3024 });
    const comGps = new File([new TextEncoder().encode("\xff\xd8\xff\xe1Exif\0\0GPSLatitude-25.63GPSLongitude-49.31")], "IMG_GPS.jpg", {
      type: "image/jpeg",
    });
    const r = await reduzirFoto(comGps, motor);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.foto.blob).not.toBe(comGps);
    expect(motor.codificar).toHaveBeenCalled();
    const bytes = new TextDecoder("latin1").decode(await r.foto.blob.arrayBuffer());
    expect(bytes).not.toContain("GPS");
    expect(bytes).not.toContain("Exif");
  });

  it("foto grande de celular (4032x3024, 6 MB) sai com no máximo 2000px e menos de 2 MB, em WebP", async () => {
    const { motor } = motorFalso({ largura: 4032, altura: 3024 });
    const r = await reduzirFoto(arquivo("IMG_1234.jpg", 6 * 1024 * 1024), motor);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Math.max(r.foto.largura, r.foto.altura)).toBeLessThanOrEqual(2000);
    expect(r.foto.blob.size).toBeLessThan(MAX_BYTES_FOTO);
    expect(r.foto.ext).toBe("webp");
    expect(r.foto.blob.type).toBe("image/webp");
  });

  it("foto em pé continua em pé", async () => {
    const { motor } = motorFalso({ largura: 3024, altura: 4032 });
    const r = await reduzirFoto(arquivo("em-pe.jpg", 5 * 1024 * 1024), motor);
    expect(r.ok && r.foto.altura > r.foto.largura).toBe(true);
    expect(r.ok && { l: r.foto.largura, a: r.foto.altura }).toEqual({ l: 1500, a: 2000 });
  });

  it("usa JPEG onde o navegador não gera WebP", async () => {
    const { motor } = motorFalso({ largura: 3000, altura: 2000, geraWebp: false });
    const r = await reduzirFoto(arquivo("foto.png", 3 * 1024 * 1024, "image/png"), motor);
    expect(r.ok && r.foto.ext).toBe("jpg");
    expect(r.ok && r.foto.blob.type).toBe("image/jpeg");
  });

  it("baixa a qualidade se a primeira tentativa passar de 2 MB, e desiste se nem assim couber", async () => {
    const pesada = motorFalso({ largura: 2000, altura: 2000, bytesPorPixel: 0.62 });
    const r = await reduzirFoto(arquivo("detalhe.jpg", 8 * 1024 * 1024), pesada.motor);
    expect(r.ok).toBe(true);
    expect(pesada.codificados.map((c) => c.qualidade)).toEqual([0.85, 0.75]);

    const impossivel = motorFalso({ largura: 2000, altura: 2000, bytesPorPixel: 5 });
    const r2 = await reduzirFoto(arquivo("ruido.jpg", 8 * 1024 * 1024), impossivel.motor);
    expect(r2.ok).toBe(false);
  });

  it("recusa arquivo acima de 20 MB antes de tentar abrir, com a mensagem certa", async () => {
    const { motor } = motorFalso({ largura: 8000, altura: 6000 });
    const r = await reduzirFoto(arquivo("gigante.jpg", 20 * 1024 * 1024 + 1), motor);
    expect(r).toEqual({ ok: false, erro: mensagemMuitoGrande("gigante.jpg") });
    expect(r.ok === false && r.erro).toContain("mais de 20 MB");
    expect(motor.decodificar).not.toHaveBeenCalled();
  });

  it("recusa formato que o navegador não abre (ex.: HEIC), com a mensagem certa", async () => {
    const { motor } = motorFalso({ largura: 0, altura: 0, ilegivel: true });
    const r = await reduzirFoto(arquivo("IMG_0001.HEIC", 3 * 1024 * 1024, "image/heic"), motor);
    expect(r).toEqual({ ok: false, erro: mensagemIlegivel("IMG_0001.HEIC") });
    expect(r.ok === false && r.erro).toContain("Não foi possível abrir");
    expect(motor.codificar).not.toHaveBeenCalled();
  });
});
