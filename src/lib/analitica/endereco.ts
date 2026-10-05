import { CATEGORIAS } from "@/lib/produtos/categorias";

// Endereço que vai ao GA4 (PR 2 da Fase 4). Sempre a origem real da página
// (window.location.origin), nunca SITE_URL: SITE_URL vale o endereço de
// produção e faria a homologação parecer produção no GA4.
//
// Da query só passa ?categoria=, e só com um valor da lista única de
// categorias (CATEGORIAS[].parametro); qualquer outra query (?editar=, um
// texto digitado) ou valor sai. O fragmento (#...) nunca entra. Na página
// 404, o caminho é o fixo /404 (o endereço digitado não vai).

const CATEGORIAS_VALIDAS: ReadonlySet<string> = new Set(CATEGORIAS.map((c) => c.parametro));

export function caminhoLimpo(caminho: string, busca: string, eh404: boolean): string {
  if (eh404) return "/404";
  const base = caminho.startsWith("/") ? caminho : `/${caminho}`;
  let categoria: string | null = null;
  try {
    categoria = new URLSearchParams(busca).get("categoria");
  } catch {
    categoria = null;
  }
  return categoria !== null && CATEGORIAS_VALIDAS.has(categoria) ? `${base}?categoria=${categoria}` : base;
}

export function enderecoLimpo(origem: string, caminho: string, busca: string, eh404: boolean): string {
  return origem + caminhoLimpo(caminho, busca, eh404);
}

// page_referrer: do próprio site, a mesma limpeza; de fora, só a origem
// (https://l.instagram.com/), sem caminho nem query; sem referrer ou
// inválido, vazio.
export function referrerLimpo(referrer: string, origemAtual: string): string {
  if (!referrer) return "";
  let url: URL;
  try {
    url = new URL(referrer);
  } catch {
    return "";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return "";
  if (url.origin === origemAtual) return enderecoLimpo(url.origin, url.pathname, url.search, false);
  return `${url.origin}/`;
}
