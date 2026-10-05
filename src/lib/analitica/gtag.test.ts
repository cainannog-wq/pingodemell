// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://pingodemell.netlify.app/produtos?categoria=bolos&utm_source=x#topo"}
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHAVE_CONSENTIMENTO, reiniciarConsentimentoParaTeste } from "@/lib/consentimento/consentimento";
import {
  apagarCookiesGa,
  enviarEvento,
  enviarUmaVezPorChave,
  iniciarGtag,
  jaEnviadoPorChave,
  registrarPageView,
  reiniciarAnaliticaParaTeste,
  revogar,
} from "./gtag";

const ID = "G-TESTE00000";

function comandos(): unknown[][] {
  return (window.dataLayer ?? []).map((a) => Array.from(a as ArrayLike<unknown>));
}
function eventos(): [string, unknown][] {
  return comandos()
    .filter((c) => c[0] === "event")
    .map((c) => [c[1] as string, c[2]]);
}
function aceitar() {
  window.localStorage.setItem(CHAVE_CONSENTIMENTO, JSON.stringify({ versao: 1, escolha: "aceito", data: "2026-10-05", versaoPolitica: 1 }));
  reiniciarConsentimentoParaTeste();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-06T01:30:00Z"));
  window.localStorage.clear();
  reiniciarConsentimentoParaTeste();
  reiniciarAnaliticaParaTeste();
  vi.stubEnv("GA4_ID", ID);
  vi.stubEnv("CONTEXTO_NETLIFY", "branch-deploy");
  document.title = "Bolos · Pingo de Mell";
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  reiniciarAnaliticaParaTeste();
});

describe("sem consentimento ou sem ID, nada", () => {
  it("sem escolha: nenhum evento, sem dataLayer nem gtag", () => {
    expect(registrarPageView()).toBe(false);
    expect(enviarEvento("begin_checkout")).toBe(false);
    expect(enviarEvento("whatsapp_clique", { origem: "home" })).toBe(false);
    expect(window.dataLayer).toBeUndefined();
    expect(window.gtag).toBeUndefined();
  });
  it("recusado: nada", () => {
    window.localStorage.setItem(CHAVE_CONSENTIMENTO, JSON.stringify({ versao: 1, escolha: "recusado", data: "2026-10-05", versaoPolitica: 1 }));
    reiniciarConsentimentoParaTeste();
    expect(enviarEvento("add_to_cart", { items: [{ item_id: "x", item_name: "X" }] })).toBe(false);
    expect(window.dataLayer).toBeUndefined();
  });
  it("aceito mas sem ID efetivo (vazio, ou produção com a Política v1): nada", () => {
    aceitar();
    vi.stubEnv("GA4_ID", "");
    expect(enviarEvento("begin_checkout")).toBe(false);
    vi.stubEnv("GA4_ID", ID);
    vi.stubEnv("CONTEXTO_NETLIFY", "production");
    expect(enviarEvento("begin_checkout")).toBe(false);
    expect(window.dataLayer).toBeUndefined();
  });
});

describe("configuração do gtag", () => {
  it("consentimento padrão antes do config, config com os campos exatos e sem debug fora da homologação", () => {
    aceitar();
    iniciarGtag(ID);
    const c = comandos();
    const consent = c.findIndex((x) => x[0] === "consent");
    const config = c.findIndex((x) => x[0] === "config");
    expect(consent).toBeGreaterThanOrEqual(0);
    expect(consent).toBeLessThan(config);
    expect(c[consent]).toEqual([
      "consent",
      "default",
      { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" },
    ]);
    expect(c[config]).toEqual([
      "config",
      ID,
      {
        send_page_view: false,
        cookie_expires: 15552000,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
        transport_type: "beacon",
      },
    ]);
    // O endereço limpo vai por "set" antes de qualquer evento.
    const set = c.find((x) => x[0] === "set") as [string, Record<string, string>];
    expect(set[1].page_location).toBe("https://pingodemell.netlify.app/produtos?categoria=bolos");
  });
  it("iniciar duas vezes não repete a configuração", () => {
    aceitar();
    iniciarGtag(ID);
    iniciarGtag(ID);
    expect(comandos().filter((x) => x[0] === "config")).toHaveLength(1);
  });
});

describe("page_view", () => {
  it("parâmetros exatos: endereço limpo (origem real, categoria válida, sem utm nem fragmento), referrer e título", () => {
    aceitar();
    expect(registrarPageView()).toBe(true);
    expect(eventos()).toEqual([
      [
        "page_view",
        {
          page_location: "https://pingodemell.netlify.app/produtos?categoria=bolos",
          page_referrer: "",
          page_title: "Bolos · Pingo de Mell",
        },
      ],
    ]);
  });
  it("o mesmo endereço seguido não repete (montagem dupla)", () => {
    aceitar();
    registrarPageView();
    registrarPageView();
    expect(eventos()).toHaveLength(1);
  });
  it("na página 404, o caminho fixo /404", () => {
    aceitar();
    const marca = document.createElement("section");
    marca.setAttribute("data-pagina-404", "");
    document.body.appendChild(marca);
    registrarPageView();
    expect((eventos()[0][1] as { page_location: string }).page_location).toBe("https://pingodemell.netlify.app/404");
    marca.remove();
  });
});

describe("eventos", () => {
  it("cada evento sai com os parâmetros exatos e nenhum a mais", () => {
    aceitar();
    enviarEvento("add_to_cart", { items: [{ item_id: "brigadeiro-gourmet", item_name: "Brigadeiro Gourmet" }] });
    enviarEvento("begin_checkout");
    enviarEvento("confirmacao_exibida");
    enviarEvento("pedido_enviado");
    enviarEvento("whatsapp_clique", { origem: "flutuante" });
    expect(eventos()).toEqual([
      ["add_to_cart", { items: [{ item_id: "brigadeiro-gourmet", item_name: "Brigadeiro Gourmet" }] }],
      ["begin_checkout", {}],
      ["confirmacao_exibida", {}],
      ["pedido_enviado", {}],
      ["whatsapp_clique", { origem: "flutuante" }],
    ]);
  });
  it("uma vez por chave de idempotência (guarda na memória da aba)", () => {
    aceitar();
    expect(enviarUmaVezPorChave("pedido_enviado", "chave-1")).toBe(true);
    expect(enviarUmaVezPorChave("pedido_enviado", "chave-1")).toBe(false);
    expect(jaEnviadoPorChave("pedido_enviado", "chave-1")).toBe(true);
    expect(enviarUmaVezPorChave("pedido_enviado", "chave-2")).toBe(true);
    expect(eventos().map((e) => e[0])).toEqual(["pedido_enviado", "pedido_enviado"]);
  });
  it("sem consentimento a guarda não marca (aceitar depois ainda conta)", () => {
    expect(enviarUmaVezPorChave("begin_checkout", "k")).toBe(false);
    expect(jaEnviadoPorChave("begin_checkout", "k")).toBe(false);
  });
});

describe("revogação", () => {
  it("desliga o envio, apaga _ga e _ga_<ID sem G-> e recarrega", () => {
    aceitar();
    document.cookie = "_ga=GA1.1.123; path=/";
    document.cookie = "_ga_TESTE00000=GS1.1.456; path=/";
    document.cookie = "outro=fica; path=/";
    const recarregar = vi.fn();
    revogar(ID, recarregar);
    expect(recarregar).toHaveBeenCalledTimes(1);
    expect((window as unknown as Record<string, unknown>)["ga-disable-G-TESTE00000"]).toBe(true);
    expect(document.cookie).toBe("outro=fica");
    // Depois de revogar, nada sai, mesmo com o aceite ainda salvo.
    expect(enviarEvento("begin_checkout")).toBe(false);
    document.cookie = "outro=; Max-Age=0; path=/";
  });
  it("tenta o host e cada domínio com ponto", () => {
    const escritas: string[] = [];
    const original = Object.getOwnPropertyDescriptor(Document.prototype, "cookie")!;
    Object.defineProperty(document, "cookie", { configurable: true, set: (v: string) => escritas.push(v), get: () => "" });
    apagarCookiesGa(ID, "homologacao--pingodemell.netlify.app");
    Object.defineProperty(document, "cookie", original);
    delete (document as unknown as Record<string, unknown>).cookie;
    expect(escritas).toEqual([
      "_ga=; Max-Age=0; path=/",
      "_ga=; Max-Age=0; path=/; domain=.homologacao--pingodemell.netlify.app",
      "_ga=; Max-Age=0; path=/; domain=.netlify.app",
      "_ga_TESTE00000=; Max-Age=0; path=/",
      "_ga_TESTE00000=; Max-Age=0; path=/; domain=.homologacao--pingodemell.netlify.app",
      "_ga_TESTE00000=; Max-Age=0; path=/; domain=.netlify.app",
    ]);
  });
});
