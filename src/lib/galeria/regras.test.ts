import { describe, expect, it } from "vitest";
import {
  MENSAGEM_LIMITE_SERVIDOR,
  caminhoDentroDaPasta,
  dimensoesReduzidas,
  lerGaleria,
  montarCaminho,
  pastaDoProduto,
  textoAlternativo,
  tipoPelosBytes,
} from "./regras";

const PRODUTO = "8b4f3b06-7e38-4d9e-ad8e-3a6a4935e1a1";
const OUTRO = "5a02782b-f4a1-4b49-90a5-38cf0f43f879";
const ARQUIVO = "0f8c2a4e-1111-4222-8333-944455556666";

describe("caminho das fotos extras", () => {
  it("monta o caminho sempre dentro de galeria/{id}/", () => {
    expect(montarCaminho(PRODUTO, ARQUIVO, "webp")).toBe(`galeria/${PRODUTO}/${ARQUIVO}.webp`);
    expect(pastaDoProduto(PRODUTO)).toBe(`galeria/${PRODUTO}`);
  });

  it("recusa id de produto ou de arquivo que não é uuid (inclusive '..' e barra)", () => {
    expect(() => pastaDoProduto("..")).toThrow();
    expect(() => pastaDoProduto(`${PRODUTO}/..`)).toThrow();
    expect(() => montarCaminho(PRODUTO, "../outro", "webp")).toThrow();
    expect(() => montarCaminho(PRODUTO, ARQUIVO, "png" as "webp")).toThrow();
  });

  it("recusa caminho fora da pasta do produto: outro produto, raiz do bucket, '..' e subpasta", () => {
    expect(caminhoDentroDaPasta(PRODUTO, `galeria/${PRODUTO}/${ARQUIVO}.jpg`)).toBe(true);
    expect(caminhoDentroDaPasta(PRODUTO, `galeria/${OUTRO}/${ARQUIVO}.jpg`)).toBe(false);
    expect(caminhoDentroDaPasta(PRODUTO, `${ARQUIVO}.jpg`)).toBe(false);
    expect(caminhoDentroDaPasta(PRODUTO, "1789145949408-yesulbv5v0k.jpg")).toBe(false);
    expect(caminhoDentroDaPasta(PRODUTO, `galeria/${PRODUTO}/../${OUTRO}/${ARQUIVO}.jpg`)).toBe(false);
    expect(caminhoDentroDaPasta(PRODUTO, `galeria/${PRODUTO}/sub/${ARQUIVO}.jpg`)).toBe(false);
    expect(caminhoDentroDaPasta(PRODUTO, `galeria/${PRODUTO}/${ARQUIVO}.png`)).toBe(false);
    expect(caminhoDentroDaPasta("..", `galeria/../${ARQUIVO}.jpg`)).toBe(false);
  });
});

describe("lista da galeria enviada pelo formulário", () => {
  it("aceita até 9 itens e recusa o 10º com a mensagem do limite", () => {
    const nove = Array.from({ length: 9 }, () => ({ novo: crypto.randomUUID(), ext: "webp" }));
    expect(lerGaleria(JSON.stringify(nove))).toMatchObject({ ok: true });

    const dez = [...nove, { novo: crypto.randomUUID(), ext: "webp" }];
    expect(lerGaleria(JSON.stringify(dez))).toEqual({ ok: false, erro: MENSAGEM_LIMITE_SERVIDOR });
  });

  it("recusa caminho pronto vindo do navegador, id inválido e id repetido", () => {
    expect(lerGaleria(JSON.stringify([{ caminho: `galeria/${PRODUTO}/${ARQUIVO}.webp` }])).ok).toBe(false);
    expect(lerGaleria(JSON.stringify([{ novo: "../x", ext: "webp" }])).ok).toBe(false);
    expect(lerGaleria(JSON.stringify([{ id: ARQUIVO }, { id: ARQUIVO }])).ok).toBe(false);
    expect(lerGaleria("não é json").ok).toBe(false);
  });
});

describe("tipo real pelos primeiros bytes", () => {
  it("reconhece JPEG e WebP e recusa o resto (ex.: PNG com extensão trocada)", () => {
    expect(tipoPelosBytes(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpg");
    const webp = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");
    expect(tipoPelosBytes(webp)).toBe("webp");
    expect(tipoPelosBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBeNull();
    expect(tipoPelosBytes(new TextEncoder().encode("<svg xmlns="))).toBeNull();
  });
});

describe("texto alternativo automático", () => {
  it("conta a capa como foto 1", () => {
    expect(textoAlternativo("Morango Banhado", 1, 4)).toBe("Morango Banhado, foto 1 de 4");
    expect(textoAlternativo("Morango Banhado", 3, 4)).toBe("Morango Banhado, foto 3 de 4");
  });
});

describe("dimensões da redução", () => {
  it("limita o lado maior a 2000px mantendo a proporção, em pé e deitada", () => {
    expect(dimensoesReduzidas(4032, 3024)).toEqual({ largura: 2000, altura: 1500 });
    expect(dimensoesReduzidas(3024, 4032)).toEqual({ largura: 1500, altura: 2000 });
  });

  it("não amplia foto pequena", () => {
    expect(dimensoesReduzidas(800, 600)).toEqual({ largura: 800, altura: 600 });
  });
});
