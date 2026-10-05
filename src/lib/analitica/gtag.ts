import { lerConsentimento } from "@/lib/consentimento/consentimento";
import { enderecoLimpo, referrerLimpo } from "./endereco";
import { lerIdGa4 } from "./id";

// Medição com o GA4 (PR 2 da Fase 4). Nada aqui roda sem ID efetivo e sem
// a escolha "aceito": sem os dois, não existe dataLayer nem gtag.
//
// Eventos (só estes): page_view, add_to_cart, begin_checkout,
// confirmacao_exibida, pedido_enviado e whatsapp_clique. Nenhum leva valor,
// preço, moeda, total, número do pedido, dado da cliente, texto digitado,
// URL do wa.me nem texto de link.
//
// O gtag.js manda o endereço da página em todo evento. Por isso o endereço
// limpo (endereco.ts) entra também por gtag("set"), a cada página: os
// eventos seguintes saem com ele, e não com o endereço cru.

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export const HOST_HOMOLOGACAO = "homologacao--pingodemell.netlify.app";

export type NomeEvento =
  | "page_view"
  | "add_to_cart"
  | "begin_checkout"
  | "confirmacao_exibida"
  | "pedido_enviado"
  | "whatsapp_clique";

export type ItemAdicionado = { item_id?: string; item_name: string };

type ParametrosDoEvento = {
  page_view: { page_location: string; page_referrer: string; page_title: string };
  add_to_cart: { items: [ItemAdicionado] };
  begin_checkout: undefined;
  confirmacao_exibida: undefined;
  pedido_enviado: undefined;
  whatsapp_clique: { origem: string };
};

let iniciadoCom: string | null = null;
let ultimoEndereco: string | null = null;

function chaveDesligar(id: string): string {
  return `ga-disable-${id}`;
}

// O ID, se a medição pode acontecer agora: ID efetivo, escolha "aceito" e
// envio não desligado pela revogação.
export function analiticaAtiva(): string | null {
  if (typeof window === "undefined") return null;
  const id = lerIdGa4();
  if (!id) return null;
  if (lerConsentimento()?.escolha !== "aceito") return null;
  if ((window as unknown as Record<string, unknown>)[chaveDesligar(id)] === true) return null;
  return id;
}

function eh404(): boolean {
  return document.querySelector("[data-pagina-404]") !== null;
}

function paginaAtual(referrer: string) {
  return {
    page_location: enderecoLimpo(window.location.origin, window.location.pathname, window.location.search, eh404()),
    page_referrer: referrer,
    page_title: document.title,
  };
}

// Cria o dataLayer e a função gtag (a fila que o gtag.js consome ao
// carregar) e manda a configuração. Uma vez por ID.
export function iniciarGtag(id: string): void {
  if (iniciadoCom === id && typeof window.gtag === "function") return;
  iniciadoCom = id;
  window.dataLayer = window.dataLayer || [];
  // O gtag.js exige o objeto arguments, não um array.
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag("consent", "default", {
    analytics_storage: "granted",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  window.gtag("js", new Date());
  window.gtag("set", paginaAtual(referrerLimpo(document.referrer, window.location.origin)));
  window.gtag("config", id, {
    send_page_view: false,
    cookie_expires: 15552000,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    transport_type: "beacon",
    ...(window.location.hostname === HOST_HOMOLOGACAO ? { debug_mode: true } : {}),
  });
}

// Visualização de página (envio automático desligado). Não repete o mesmo
// endereço seguido (montagem dupla, hidratação). O referrer é o endereço
// limpo da página anterior; na primeira, o document.referrer limpo.
export function registrarPageView(): boolean {
  const id = analiticaAtiva();
  if (!id) return false;
  iniciarGtag(id);
  const referrer = ultimoEndereco ?? referrerLimpo(document.referrer, window.location.origin);
  const pagina = paginaAtual(referrer);
  if (pagina.page_location === ultimoEndereco) return false;
  window.gtag!("set", pagina);
  window.gtag!("event", "page_view", pagina);
  ultimoEndereco = pagina.page_location;
  return true;
}

export function enviarEvento<N extends Exclude<NomeEvento, "page_view">>(
  nome: N,
  ...parametros: ParametrosDoEvento[N] extends undefined ? [] : [ParametrosDoEvento[N]]
): boolean {
  const id = analiticaAtiva();
  if (!id) return false;
  iniciarGtag(id);
  window.gtag!("event", nome, parametros[0] ?? {});
  return true;
}

// Uma vez por chave de idempotência do pedido, guardada na memória da aba
// (recarregar a página zera a guarda).
const enviadosPorChave = new Set<string>();

export function enviarUmaVezPorChave(nome: "begin_checkout" | "pedido_enviado", chave: string): boolean {
  const marca = `${nome}:${chave}`;
  if (enviadosPorChave.has(marca)) return false;
  if (!enviarEvento(nome)) return false;
  enviadosPorChave.add(marca);
  return true;
}

export function jaEnviadoPorChave(nome: "begin_checkout" | "pedido_enviado", chave: string): boolean {
  return enviadosPorChave.has(`${nome}:${chave}`);
}

// Revogar (recusar depois de ter aceitado): desliga o gtag.js já carregado,
// apaga _ga e _ga_<ID sem o "G-"> no host e nos domínios com ponto, e
// recarrega a página (sem aceite, nada de GA4 na carga seguinte).
export function apagarCookiesGa(id: string, host: string = window.location.hostname): void {
  const nomes = ["_ga", `_ga_${id.replace(/^G-/, "")}`];
  const partes = host.split(".");
  const dominios: (string | null)[] = [null];
  for (let i = 0; i < partes.length - 1; i++) dominios.push(`.${partes.slice(i).join(".")}`);
  for (const nome of nomes) {
    for (const dominio of dominios) {
      document.cookie = `${nome}=; Max-Age=0; path=/${dominio ? `; domain=${dominio}` : ""}`;
    }
  }
}

export function revogar(id: string, recarregar: () => void = () => window.location.reload()): void {
  (window as unknown as Record<string, unknown>)[chaveDesligar(id)] = true;
  apagarCookiesGa(id);
  recarregar();
}

// Só para testes: volta ao estado de página recém-aberta.
export function reiniciarAnaliticaParaTeste(): void {
  iniciadoCom = null;
  ultimoEndereco = null;
  enviadosPorChave.clear();
  if (typeof window !== "undefined") {
    delete window.dataLayer;
    delete window.gtag;
    for (const chave of Object.keys(window)) if (chave.startsWith("ga-disable-")) delete (window as unknown as Record<string, unknown>)[chave];
  }
}
