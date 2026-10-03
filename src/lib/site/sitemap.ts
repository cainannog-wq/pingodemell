// Sitemap do site público (PR fase4/seo-metadados), numa função pura coberta
// por teste. A rota (src/app/sitemap.xml/route.ts) só busca os dados e
// responde 404 enquanto o site não for indexável.
//
// Entram: Home, Lista, Quem Somos, cada categoria com pelo menos 1 produto
// ativo e disponível e cada produto ativo e disponível pelo slug. Ficam de
// fora: carrinho, checkout, confirmação, Política, login, admin e API.

import { CATEGORIA_VALUES } from "@/lib/produtos/types";
import type { ProdutoVitrine } from "@/lib/vitrine/mais-pedidos";
import { ROTAS } from "./rotas";
import { urlDoSite } from "./url";

export type ProdutoSitemap = Pick<ProdutoVitrine, "slug" | "Categoria" | "atualizado_em">;

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };

export function escaparXml(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

// lastmod em data e hora ISO (UTC); não decide "que dia é".
function lastmod(atualizadoEm: string | null): string | null {
  if (!atualizadoEm) return null;
  const instante = new Date(atualizadoEm);
  return Number.isNaN(instante.getTime()) ? null : instante.toISOString();
}

// `produtos`: só os ativos e disponíveis (quem chama aplica a regra da
// vitrine, semIndisponiveis).
export function montarSitemap(produtos: ProdutoSitemap[]): string {
  const comSlug = produtos.filter((p): p is ProdutoSitemap & { slug: string } => Boolean(p.slug));
  const categorias = CATEGORIA_VALUES.filter((c) => produtos.some((p) => p.Categoria === c));

  const entradas: { caminho: string; lastmod: string | null }[] = [
    { caminho: ROTAS.home, lastmod: null },
    { caminho: ROTAS.lista, lastmod: null },
    { caminho: ROTAS.quemSomos, lastmod: null },
    ...categorias.map((c) => ({ caminho: ROTAS.listaPorCategoria(c), lastmod: null })),
    ...[...comSlug]
      .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
      .map((p) => ({ caminho: ROTAS.produto(p.slug), lastmod: lastmod(p.atualizado_em) })),
  ];

  const urls = entradas.map(({ caminho, lastmod: data }) => {
    const loc = `    <loc>${escaparXml(urlDoSite(caminho))}</loc>`;
    return data ? `  <url>\n${loc}\n    <lastmod>${data}</lastmod>\n  </url>` : `  <url>\n${loc}\n  </url>`;
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
}
