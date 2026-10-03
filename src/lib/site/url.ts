// Endereço base do site (PR fase4/seo-metadados). Único lugar que escreve o
// domínio: metadataBase, canonical, Open Graph, sitemap e robots.txt saem
// daqui.
//
// No corte do DNS vira "https://www.pingodemell.com.br" (com www; o endereço
// sem www redireciona para ele), junto com SITE_INDEXAVEL
// (src/lib/site/indexacao.ts). url.test.ts trava o valor de hoje e precisa
// mudar junto.
export const SITE_URL = "https://pingodemell.netlify.app";

// Endereço absoluto de um caminho do site ("/produtos" →
// "https://.../produtos").
export function urlDoSite(caminho: string): string {
  return `${SITE_URL}${caminho.startsWith("/") ? caminho : `/${caminho}`}`;
}
