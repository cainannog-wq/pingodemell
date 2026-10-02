import type { MetadataRoute } from "next";

// robots.txt (PR noindex-site). Libera tudo de propósito, com a trava de
// indexação ligada ou desligada (SITE_INDEXAVEL, src/lib/site/indexacao.ts).
//
// NÃO trocar por "Disallow: /" para tirar o site do Google: com Disallow o
// Google deixa de visitar as páginas e não lê o noindex delas (X-Robots-Tag e
// meta robots), e uma página que já estava indexada pode continuar no
// resultado da busca. Quem tira o site do Google é o noindex; o robots.txt
// só precisa deixar o Google chegar até ele. O sitemap entra na Fase 4.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
  };
}
