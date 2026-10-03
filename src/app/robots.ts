import type { MetadataRoute } from "next";
import { SITE_INDEXAVEL } from "@/lib/site/indexacao";
import { urlDoSite } from "@/lib/site/url";

// robots.txt (PR noindex-site). Libera tudo de propósito, com a trava de
// indexação ligada ou desligada (SITE_INDEXAVEL, src/lib/site/indexacao.ts).
//
// NÃO trocar por "Disallow: /" para tirar o site do Google: com Disallow o
// Google deixa de visitar as páginas e não lê o noindex delas (X-Robots-Tag e
// meta robots), e uma página que já estava indexada pode continuar no
// resultado da busca. Quem tira o site do Google é o noindex; o robots.txt
// só precisa deixar o Google chegar até ele.
//
// A linha Sitemap só entra com o site indexável (PR fase4/seo-metadados):
// com a trava ligada o /sitemap.xml responde 404.
//
// Com o site indexável, Disallow só para /admin e /api/ (PR
// fase4/indexacao-correcoes): não têm nada para o Google e recebem o
// X-Robots-Tag noindex sempre. Carrinho, checkout, confirmação, login e
// Política ficam sem Disallow, só com noindex, para o Google conseguir lê-lo.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      ...(SITE_INDEXAVEL ? { disallow: ["/admin", "/api/"] } : {}),
    },
    ...(SITE_INDEXAVEL ? { sitemap: urlDoSite("/sitemap.xml") } : {}),
  };
}
