import { describe, expect, it, vi } from "vitest";
import { mensagemIlegivel, mensagemMuitoGrande, reduzirFoto, type MotorImagem } from "./reduzir";
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

describe("reduzirFoto", () => {
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
