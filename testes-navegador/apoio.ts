import { expect, type BrowserContext, type Page } from "@playwright/test";
import { VERSAO_POLITICA } from "../src/lib/site/politica-versao";

// Apoio dos testes de navegador do consentimento (PR 2 da Fase 4).
//
// Interceptação, montada antes de qualquer navegação, em cada contexto:
// - Google (googletagmanager.com, google-analytics.com, analytics.google.com,
//   doubleclick.net, www.google.com/g/collect): contada. O gtag/js recebe um
//   script falso, servido aqui, que só marca que carregou (não manda nada);
//   o resto é abortado. Nada chega ao Google.
// - WhatsApp (wa.me, api.whatsapp.com): contado e abortado.
// - Escritas: POST /api/pedidos (criação de pedido) e qualquer escrita na
//   Supabase (método diferente de GET, HEAD e OPTIONS): contadas e abortadas.
//   Cada teste termina provando que nenhuma saiu.

export const ID = "G-TESTE00000";

const GOOGLE = /(^|\.)(googletagmanager\.com|google-analytics\.com|analytics\.google\.com|doubleclick\.net)$/;
const WHATSAPP = /(^|\.)(wa\.me|api\.whatsapp\.com)$/;
const GTAG_FALSO = "window.__gtagFalsoCarregado = (window.__gtagFalsoCarregado || 0) + 1;";

export type Requisicao = { url: string; metodo: string; corpo: string | null };
export type Registro = { google: Requisicao[]; whatsapp: Requisicao[]; escritas: Requisicao[] };

export async function interceptar(contexto: BrowserContext): Promise<Registro> {
  const registro: Registro = { google: [], whatsapp: [], escritas: [] };
  await contexto.route("**/*", (rota) => {
    const req = rota.request();
    const url = new URL(req.url());
    const item = { url: req.url(), metodo: req.method(), corpo: req.postData() };
    if (GOOGLE.test(url.hostname) || (url.hostname === "www.google.com" && url.pathname.startsWith("/g/collect"))) {
      registro.google.push(item);
      if (url.hostname === "www.googletagmanager.com" && url.pathname === "/gtag/js") {
        return rota.fulfill({ status: 200, contentType: "application/javascript", body: GTAG_FALSO });
      }
      return rota.abort();
    }
    if (WHATSAPP.test(url.hostname)) {
      registro.whatsapp.push(item);
      return rota.abort();
    }
    if (url.pathname === "/api/pedidos" && req.method() !== "GET" && req.method() !== "HEAD") {
      registro.escritas.push(item);
      return rota.abort();
    }
    if (url.hostname.endsWith(".supabase.co") && !["GET", "HEAD", "OPTIONS"].includes(req.method())) {
      registro.escritas.push(item);
      return rota.abort();
    }
    return rota.continue();
  });
  return registro;
}

export function semEscritas(registro: Registro) {
  expect(registro.escritas, "nenhuma escrita (POST /api/pedidos ou Supabase) pode sair").toEqual([]);
}

// Comandos do dataLayer (cada um é o arguments do gtag).
export async function comandos(page: Page): Promise<unknown[][]> {
  return page.evaluate(() => {
    const dl = (window as unknown as { dataLayer?: ArrayLike<unknown>[] }).dataLayer;
    return dl ? Array.from(dl, (a) => Array.from(a)) : [];
  });
}

export async function eventos(page: Page): Promise<[string, Record<string, unknown>][]> {
  return (await comandos(page)).filter((c) => c[0] === "event").map((c) => [c[1] as string, c[2] as Record<string, unknown>]);
}

export async function temDataLayer(page: Page): Promise<boolean> {
  return page.evaluate(() => "dataLayer" in window || "gtag" in window);
}

// "Hoje" no fuso da loja, como o site decide (AAAA-MM-DD).
export function hojeBrasilia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
export function diasAntes(dataIso: string, dias: number): string {
  const [a, m, d] = dataIso.split("-").map(Number);
  // Só aritmética de calendário sobre uma data já decidida (não decide "hoje").
  const alvo = new Date(Date.UTC(a, m - 1, d - dias));
  const dois = (n: number) => String(n).padStart(2, "0");
  return `${alvo.getUTCFullYear()}-${dois(alvo.getUTCMonth() + 1)}-${dois(alvo.getUTCDate())}`;
}

export async function gravarEscolha(page: Page, escolha: "aceito" | "recusado", data = hojeBrasilia(), versaoPolitica = VERSAO_POLITICA) {
  await page.evaluate(
    ([e, d, v]) => window.localStorage.setItem("pdm-consentimento-v1", JSON.stringify({ versao: 1, escolha: e, data: d, versaoPolitica: v })),
    [escolha, data, versaoPolitica] as const
  );
}

export const banner = (page: Page) => page.getByRole("region", { name: "Preferências de privacidade" });
// Desde 07/10/2026 o botão fica só na seção 8 da Política (id "cookies").
export const botaoPreferencias = (page: Page) => page.getByRole("button", { name: "Preferências de privacidade" });

// Retrato sintético do pedido (dados inventados), gravado no sessionStorage
// da aba, para a /confirmacao. Nenhum pedido é enviado.
export async function gravarRetrato(page: Page, modo: "registrado" | "sem_registro") {
  await page.evaluate((m) => {
    const retrato = {
      modo: m,
      numero: m === "registrado" ? 9999 : null,
      mensagem: "Olá! Pedido de teste inventado, sem dado real.",
      formato: "completo",
      cabe: true,
      linhas: [{ nome: "Produto de teste", quantidade: "1 un", detalhe: null, observacao: null, valor_centavos: 1000 }],
      totalCentavos: 1000,
      temBolo: false,
      prazo: null,
      pendenteEsvaziar: m === "sem_registro",
    };
    window.sessionStorage.setItem("pdm-pedido-enviado-v1", JSON.stringify({ versao: 1, retrato }));
  }, modo);
}
