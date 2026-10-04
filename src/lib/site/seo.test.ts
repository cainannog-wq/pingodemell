import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CATEGORIA_VALUES } from "@/lib/produtos/types";
import { IMAGEM_PADRAO, SEO_CATEGORIAS, SEO_SITE, metadadosIndexaveis } from "./seo";
import { SITE_URL } from "./url";

const TODOS = [SEO_SITE, ...Object.values(SEO_CATEGORIAS)];
// Hífen, hífen tipográfico, hífen não separável, sinal de menos, travessões.
const HIFENS = /[-‐‑−–—]/;

describe("textos de SEO (PR fase4/seo-metadados)", () => {
  it("uma entrada para cada uma das 7 categorias", () => {
    expect(Object.keys(SEO_CATEGORIAS).sort()).toEqual([...CATEGORIA_VALUES].sort());
  });

  it("títulos com no máximo 72 caracteres", () => {
    for (const t of TODOS) expect(t.titulo.length, t.titulo).toBeLessThanOrEqual(72);
  });

  it("descrições com no máximo 160 caracteres", () => {
    for (const t of TODOS) expect(t.descricao.length, t.descricao).toBeLessThanOrEqual(160);
  });

  it("nenhum texto tem hífen nem travessão", () => {
    for (const t of TODOS) {
      expect(t.titulo, t.titulo).not.toMatch(HIFENS);
      expect(t.descricao, t.descricao).not.toMatch(HIFENS);
    }
  });

  it("a imagem padrão existe em public/", () => {
    expect(existsSync(join(process.cwd(), "public", IMAGEM_PADRAO))).toBe(true);
  });
});

describe("metadadosIndexaveis", () => {
  it("canonical e og:url absolutos e iguais; site, idioma e tipo", () => {
    const m = metadadosIndexaveis({ ...SEO_SITE, caminho: "/quem-somos" });
    expect(m.title).toBe(SEO_SITE.titulo);
    expect(m.description).toBe(SEO_SITE.descricao);
    expect(m.alternates?.canonical).toBe(`${SITE_URL}/quem-somos`);
    expect(m.openGraph).toMatchObject({
      title: SEO_SITE.titulo,
      description: SEO_SITE.descricao,
      url: `${SITE_URL}/quem-somos`,
      siteName: "Pingo de Mell",
      locale: "pt_BR",
      type: "website",
      images: [{ url: `${SITE_URL}${IMAGEM_PADRAO}` }],
    });
  });

  it("imagem absoluta (capa do produto) passa como está", () => {
    const capa = "https://exemplo.supabase.co/storage/v1/object/public/Pingo%20de%20Mell/capa.webp";
    const m = metadadosIndexaveis({ ...SEO_SITE, caminho: "/produtos/x", imagem: capa });
    expect(m.openGraph).toMatchObject({ images: [{ url: capa }] });
  });
});
