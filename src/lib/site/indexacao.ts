// Trava de indexação do site inteiro (decisão do Cainan, PR noindex-site).
//
// O site fica fora dos buscadores em qualquer domínio até o DNS do domínio
// real ser apontado. Virar SITE_INDEXAVEL para true é um item do checklist do
// corte de DNS; depois disso, a Fase 4 troca esta trava por SEO de verdade.
//
// Onde a trava vale:
//   - cabeçalho X-Robots-Tag em todas as rotas (next.config.ts);
//   - meta robots do layout raiz (src/app/layout.tsx), herdada pelas páginas
//     que não definem robots próprio.
// O robots.txt (src/app/robots.ts) NÃO participa: ele libera tudo, para o
// Google conseguir visitar as páginas e ler o noindex.
//
// Checkout, Política de Privacidade, confirmação, carrinho, login e admin têm
// robots próprio e continuam noindex com a constante em qualquer valor.
// Admin, login e API recebem também o cabeçalho, sempre (ROTAS_SEMPRE_NOINDEX).

export const SITE_INDEXAVEL = false;

export const NOINDEX = "noindex, nofollow";

// Rotas com X-Robots-Tag noindex, nofollow com SITE_INDEXAVEL em qualquer
// valor e em qualquer contexto (PR fase4/indexacao-correcoes), no formato de
// source do headers() do next.config.ts. "/admin/:path*" cobre também o
// próprio "/admin".
export const ROTAS_SEMPRE_NOINDEX = ["/admin/:path*", "/login", "/api/:path*"] as const;

// Valor do X-Robots-Tag, ou null para não enviar o cabeçalho. A homologação
// (branch deploy da Netlify) fica fora dos buscadores sempre, mesmo com o
// site indexável.
export function cabecalhoRobots(indexavel: boolean, contexto: string | undefined): string | null {
  if (!indexavel || contexto === "branch-deploy") return NOINDEX;
  return null;
}

// robots da metadata do layout raiz: undefined deixa o padrão do Next
// (indexável).
export function metadataRobots(indexavel: boolean): { index: false; follow: false } | undefined {
  return indexavel ? undefined : { index: false, follow: false };
}
