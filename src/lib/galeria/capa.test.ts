import { describe, expect, it } from "vitest";
import { caminhoDaCapa, caminhoNoBucket, lerCapaNova, montarCaminhoCapa, pastaDaCapa } from "./capa";

const PRODUTO = "197d31af-803d-4af9-b6d4-66fd013dff4d";
const OUTRO = "5a02782b-f4a1-4b49-90a5-38cf0f43f879";
const A = "aaaaaaaa-0000-4000-8000-000000000000";
const SITE = "https://npervqefspmwmrekskcb.supabase.co";
const BASE = `${SITE}/storage/v1/object/public/Pingo%20de%20Mell`;

describe("caminho da capa", () => {
  it("capa nova sempre em capa/{id}/{uuid}.webp|jpg, montada a partir de uuids validados", () => {
    expect(montarCaminhoCapa(PRODUTO, A, "webp")).toBe(`capa/${PRODUTO}/${A}.webp`);
    expect(() => pastaDaCapa("..")).toThrow();
    expect(() => montarCaminhoCapa(PRODUTO, "../x", "webp")).toThrow();
    expect(() => montarCaminhoCapa(PRODUTO, A, "png" as "webp")).toThrow();
  });

  it("lê o caminho do endereço público gravado no banco (espaços do nome do bucket codificados)", () => {
    expect(caminhoNoBucket(`${BASE}/1789145949408-yesulbv5v0k.jpg`, SITE)).toBe("1789145949408-yesulbv5v0k.jpg");
    expect(caminhoNoBucket(`${BASE}/capa/${PRODUTO}/${A}.webp`, `${SITE}/`)).toBe(`capa/${PRODUTO}/${A}.webp`);
    expect(caminhoNoBucket(null, SITE)).toBeNull();
    expect(caminhoNoBucket(`${SITE}/storage/v1/object/public/outro/${A}.webp`, SITE)).toBeNull();
  });

  it("as 7 capas de hoje (raiz) e a capa nova do próprio produto são aceitas para apagar; o resto não", () => {
    for (const arquivo of [
      "1789145949408-yesulbv5v0k.jpg",
      "1790347390160-86kea86na5t.webp",
      "1789162576907-de960btf3eq.jpeg",
      "1790172143677-m6hbigriv3a.webp",
      "1790172192227-cw0x0l6hd3j.jpg",
      "1790086342786-qbj3k620edf.webp",
      "imagem_2026-08-31_163143635.png",
    ]) {
      expect(caminhoDaCapa(`${BASE}/${arquivo}`, PRODUTO, SITE)).toEqual({ caminho: arquivo, local: "raiz" });
    }
    expect(caminhoDaCapa(`${BASE}/capa/${PRODUTO}/${A}.webp`, PRODUTO, SITE)).toEqual({ caminho: `capa/${PRODUTO}/${A}.webp`, local: "pasta" });

    for (const url of [
      `${BASE}/capa/${OUTRO}/${A}.webp`, // capa de outro produto
      `${BASE}/galeria/${PRODUTO}/${A}.webp`, // foto extra
      `${BASE}/..`,
      `${BASE}/%2E%2E%2Fx.jpg`,
      `${BASE}/capa/${PRODUTO}/sub/${A}.webp`,
      `${BASE}/capa/${PRODUTO}/${A}.png`,
      `${BASE}/a%ZZ.jpg`, // codificação quebrada
      `https://outro.site/storage/v1/object/public/Pingo%20de%20Mell/${A}.webp`,
    ]) {
      expect(caminhoDaCapa(url, PRODUTO, SITE), url).toBeNull();
    }
  });
});

describe("campo capa do formulário", () => {
  it("aceita só id do arquivo + extensão; sem o campo, a capa não muda", () => {
    expect(lerCapaNova(null)).toEqual({ ok: true, capa: null });
    expect(lerCapaNova("")).toEqual({ ok: true, capa: null });
    expect(lerCapaNova(JSON.stringify({ novo: A, ext: "jpg" }))).toEqual({ ok: true, capa: { novo: A, ext: "jpg" } });
    for (const bruto of [
      JSON.stringify({ caminho: `capa/${PRODUTO}/${A}.jpg` }),
      JSON.stringify({ novo: `../${A}`, ext: "jpg" }),
      JSON.stringify({ novo: A, ext: "png" }),
      JSON.stringify([{ novo: A, ext: "jpg" }]),
      "{",
      new File(["x"], "x.jpg"),
    ]) {
      expect(lerCapaNova(bruto)).toEqual({ ok: false });
    }
  });
});
