// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Analitica } from "@/components/site/analitica/Analitica";
import { CarrinhoProvider } from "@/components/site/CarrinhoProvider";
import { ConsentimentoProvider } from "@/components/site/consentimento/ConsentimentoProvider";
import { reiniciarAnaliticaParaTeste } from "@/lib/analitica/gtag";
import { CHAVE_CARRINHO, reiniciarParaTeste } from "@/lib/carrinho/armazenamento";
import { escreverCarrinho, lerCarrinho } from "@/lib/carrinho/regras";
import { CHAVE_CONSENTIMENTO, reiniciarConsentimentoParaTeste } from "@/lib/consentimento/consentimento";
import { montarRetrato } from "@/lib/pedidos/confirmacao";
import { DADOS_TESTE, LINHAS_TESTE } from "@/lib/pedidos/fixtura-teste";
import { CHAVE_RETRATO, lerRetrato, reiniciarRetratoParaTeste, salvarRetrato, type Retrato } from "@/lib/pedidos/retrato";
import ConfirmacaoPage from "./page";

// GA4 na /confirmacao (PR 2 da Fase 4), com retrato sintético (dados
// inventados da fixtura) e a rede bloqueada: nada sai do navegador de teste.
// - confirmacao_exibida: uma vez por pedido (marca no retrato), nos dois
//   modos; sem retrato, não dispara;
// - pedido_enviado: no clique do botão final, uma vez por pedido; o
//   whatsapp_clique (origem "confirmacao") sai junto, a cada clique.

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/confirmacao",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(() => {
    throw new Error("a confirmação não consulta o banco");
  }),
}));

const CINCO = LINHAS_TESTE.slice(0, 5);
function resposta(numero = 1048) {
  const itens = CINCO.map((l) => ({ valor_centavos: Math.round(l.preco * 100) * l.quantidade }));
  const total = itens.reduce((a, b) => a + b.valor_centavos, 0);
  return { numero, itens, subtotal_centavos: total, total_centavos: total };
}
const REGISTRADO: Retrato = montarRetrato({ dados: DADOS_TESTE, linhas: CINCO, resposta: resposta(), prazo: null });
const SEM_REGISTRO: Retrato = montarRetrato({ dados: DADOS_TESTE, linhas: CINCO, resposta: null, prazo: null });

const rede = vi.fn(() => {
  throw new Error("a confirmação não chama a rede");
});
const beacon = vi.fn(() => {
  throw new Error("nada de beacon no teste");
});

function eventos(): [string, unknown][] {
  return (window.dataLayer ?? [])
    .map((a) => Array.from(a as ArrayLike<unknown>))
    .filter((c) => c[0] === "event")
    .map((c) => [c[1] as string, c[2]]);
}
const nomes = () => eventos().map((e) => e[0]);

function abrir() {
  reiniciarParaTeste();
  return render(
    <CarrinhoProvider>
      <ConsentimentoProvider>
        <Analitica />
        <ConfirmacaoPage />
      </ConsentimentoProvider>
    </CarrinhoProvider>
  );
}
// Recarregar a aba: a memória da página zera; o sessionStorage fica.
function recarregar() {
  cleanup();
  reiniciarAnaliticaParaTeste();
  reiniciarRetratoParaTeste();
  reiniciarConsentimentoParaTeste();
  return abrir();
}
const botaoFinal = () => screen.getByRole("link", { name: /^Enviar pelo WhatsApp/ });
// A nova aba do wa.me não abre no jsdom.
const semNavegar = (e: Event) => {
  if (e.target instanceof Element && e.target.closest("a[href^=\"https://wa.me/\"]")) e.preventDefault();
};

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  reiniciarRetratoParaTeste();
  reiniciarConsentimentoParaTeste();
  reiniciarAnaliticaParaTeste();
  vi.stubEnv("GA4_ID", "G-TESTE00000");
  vi.stubEnv("CONTEXTO_NETLIFY", "branch-deploy");
  window.localStorage.setItem(CHAVE_CONSENTIMENTO, JSON.stringify({ versao: 1, escolha: "aceito", data: "2026-10-05", versaoPolitica: 1 }));
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-06T01:30:00Z"));
  vi.stubGlobal("fetch", rede);
  vi.stubGlobal("XMLHttpRequest", function XMLHttpRequest() {
    throw new Error("a confirmação não chama a rede");
  });
  Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: beacon });
  window.addEventListener("click", semNavegar);
});
afterEach(() => {
  // Nenhuma requisição saiu: nem fetch, nem XHR, nem beacon (o gtag.js não
  // roda no jsdom; os eventos ficam no dataLayer).
  expect(rede).not.toHaveBeenCalled();
  expect(beacon).not.toHaveBeenCalled();
  window.removeEventListener("click", semNavegar);
  cleanup();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  reiniciarAnaliticaParaTeste();
});

describe.each([
  ["gravado", REGISTRADO],
  ["sem registro", SEM_REGISTRO],
])("confirmação com retrato (%s)", (_, retrato) => {
  it("confirmacao_exibida uma vez, sem parâmetros, e não repete ao recarregar", async () => {
    salvarRetrato(retrato);
    abrir();
    await screen.findByRole("heading", { level: 1 });
    expect(eventos().filter((e) => e[0] === "confirmacao_exibida")).toEqual([["confirmacao_exibida", {}]]);
    expect(lerRetrato()?.medido).toEqual({ exibida: true, enviado: false });

    recarregar();
    await screen.findByRole("heading", { level: 1 });
    expect(nomes().filter((n) => n === "confirmacao_exibida")).toEqual([]);
  });

  it("pedido_enviado uma vez com duplo clique e depois de recarregar; whatsapp_clique a cada clique, só com a origem", async () => {
    window.localStorage.setItem(CHAVE_CARRINHO, escreverCarrinho(CINCO));
    salvarRetrato(retrato);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    abrir();
    await user.dblClick(botaoFinal());
    // No mesmo clique: whatsapp_clique (ouvido na captura) e pedido_enviado.
    expect(eventos().filter((e) => e[0] !== "page_view" && e[0] !== "confirmacao_exibida")).toEqual([
      ["whatsapp_clique", { origem: "confirmacao" }],
      ["pedido_enviado", {}],
      ["whatsapp_clique", { origem: "confirmacao" }],
    ]);
    expect(lerRetrato()?.medido).toEqual({ exibida: true, enviado: true });
    // O link continua abrindo a nova aba do wa.me, como antes.
    expect(botaoFinal()).toHaveAttribute("target", "_blank");
    expect(botaoFinal().getAttribute("href")).toMatch(/^https:\/\/wa\.me\//);
    // Sem registro: o carrinho esvazia no clique (comportamento de antes).
    if (retrato.modo === "sem_registro") expect(lerCarrinho(window.localStorage.getItem(CHAVE_CARRINHO))).toEqual([]);

    recarregar();
    await user.click(botaoFinal());
    expect(nomes().filter((n) => n === "pedido_enviado")).toEqual([]);
    expect(nomes().filter((n) => n === "whatsapp_clique")).toEqual(["whatsapp_clique"]);

    // Nenhum evento leva a mensagem, a URL do wa.me, o número, nome ou valor.
    const tudo = JSON.stringify(eventos());
    expect(tudo).not.toContain("wa.me");
    expect(tudo).not.toContain(DADOS_TESTE.nome);
    expect(tudo).not.toContain("1048");
    expect(tudo).not.toMatch(/valor|total|preco|price|value|currency/);
  });
});

describe("sem consentimento", () => {
  it("nada sai e nada é marcado no retrato (aceitar depois ainda conta)", async () => {
    window.localStorage.removeItem(CHAVE_CONSENTIMENTO);
    reiniciarConsentimentoParaTeste();
    salvarRetrato(REGISTRADO);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    abrir();
    await user.click(botaoFinal());
    expect(window.dataLayer).toBeUndefined();
    expect(JSON.parse(window.sessionStorage.getItem(CHAVE_RETRATO)!).retrato.medido).toBeUndefined();
  });
});

describe("confirmação sem retrato", () => {
  it("não dispara confirmacao_exibida nem pedido_enviado; o link geral manda só whatsapp_clique (confirmacao_sem_retrato)", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    abrir();
    await screen.findByRole("heading", { level: 1, name: "Nenhum pedido recente" });
    await user.click(screen.getByRole("link", { name: /^Falar com a gente no WhatsApp/ }));
    expect(eventos().filter((e) => e[0] !== "page_view")).toEqual([["whatsapp_clique", { origem: "confirmacao_sem_retrato" }]]);
  });
});
