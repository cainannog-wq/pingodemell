import { describe, expect, it } from "vitest";
import { SITE_URL } from "@/lib/site/url";
import { escaparXml, montarSitemap, type ProdutoSitemap } from "./sitemap";

const BASE = SITE_URL;

function p(slug: string | null, Categoria: ProdutoSitemap["Categoria"], atualizado_em = "2026-09-23T14:29:18.070Z"): ProdutoSitemap {
  return { slug, Categoria, atualizado_em };
}

const locs = (xml: string) => [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);

describe("sitemap (PR fase4/seo-metadados)", () => {
  it("Home, Lista, Quem Somos, categorias com produto e produtos por slug, todos absolutos", () => {
    const xml = montarSitemap([p("coca-cola-2l", "Bebidas"), p("beijinho", "Doces"), p("bento-flork", "Bento Cake")]);
    expect(locs(xml)).toEqual([
      `${BASE}/`,
      `${BASE}/produtos`,
      `${BASE}/quem-somos`,
      `${BASE}/produtos?categoria=bento-cake`,
      `${BASE}/produtos?categoria=doces`,
      `${BASE}/produtos?categoria=bebidas`,
      `${BASE}/produtos/beijinho`,
      `${BASE}/produtos/bento-flork`,
      `${BASE}/produtos/coca-cola-2l`,
    ]);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')).toBe(true);
  });

  it("categoria sem produto (Kits) fica fora", () => {
    const xml = montarSitemap([p("beijinho", "Doces")]);
    expect(xml).not.toContain("categoria=kits");
    expect(locs(xml).filter((l) => l.includes("categoria="))).toEqual([`${BASE}/produtos?categoria=doces`]);
  });

  it("lastmod do produto é o atualizado_em em ISO; páginas fixas sem lastmod", () => {
    const xml = montarSitemap([p("beijinho", "Doces", "2026-09-23 15:16:11.846703+00")]);
    expect(xml).toContain(`<loc>${BASE}/produtos/beijinho</loc>\n    <lastmod>2026-09-23T15:16:11.846Z</lastmod>`);
    expect(xml.match(/<lastmod>/g)).toHaveLength(1);
  });

  it("nenhuma rota proibida", () => {
    const xml = montarSitemap([p("beijinho", "Doces")]);
    for (const proibida of ["/carrinho", "/checkout", "/confirmacao", "/politica-de-privacidade", "/login", "/admin", "/api", "editar="]) {
      expect(xml, proibida).not.toContain(proibida);
    }
  });

  it("produto sem slug não entra", () => {
    expect(locs(montarSitemap([p(null, "Doces")]))).not.toContain(`${BASE}/produtos/null`);
  });

  it("escapa & < > \" ' em XML", () => {
    expect(escaparXml(`/produtos?a=1&b=<2>"3"'4'`)).toBe("/produtos?a=1&amp;b=&lt;2&gt;&quot;3&quot;&apos;4&apos;");
  });
});
