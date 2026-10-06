// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Analitica } from "@/components/site/analitica/Analitica";
import { CarrinhoProvider } from "@/components/site/CarrinhoProvider";
import { ConsentimentoProvider } from "@/components/site/consentimento/ConsentimentoProvider";
import { reiniciarAnaliticaParaTeste } from "@/lib/analitica/gtag";
import { CHAVE_CARRINHO, reiniciarParaTeste } from "@/lib/carrinho/armazenamento";
import { escreverCarrinho, type LinhaCarrinho } from "@/lib/carrinho/regras";
import type { Oferta } from "@/lib/checkout/ofertas";
import { CHAVE_CONSENTIMENTO, reiniciarConsentimentoParaTeste } from "@/lib/consentimento/consentimento";
import { CHAVE_IDEMPOTENCIA, lerRetrato, reiniciarRetratoParaTeste } from "@/lib/pedidos/retrato";
import { createClient as clienteDoNavegador } from "@/lib/supabase/client";

// GA4 no checkout (PR 2 da Fase 4), com a rede interceptada: a rota de
// criação de pedido (POST /api/pedidos) é simulada aqui e nunca chega a
// servidor nenhum; fetch para qualquer outro endereço, XHR, beacon e o
// cliente da Supabase no navegador falham o teste. O afterEach prova que
// nenhuma escrita saiu.

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.setConfig({ testTimeout: 30_000 });

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={props.alt as string} src={props.src as string} />;
  },
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/checkout",
  useSearchParams: () => new URLSearchParams(),
}));

const BRIGADEIRO: Oferta = {
  id: "p-brigadeiro",
  slug: "brigadeiro-gourmet",
  nome: "Brigadeiro Gourmet",
  descricao: null,
  preco: 2.35,
  image_url: null,
  Categoria: "Doces",
  tipo: "normal",
  unidade_venda: "unidade",
  pedido_minimo: 30,
  step_quantidade: "livre",
  ativo: true,
  destaque: false,
  atualizado_em: "2026-09-01T12:00:00Z",
  prazo_producao_dias: 1,
};
const EMPADA: Oferta = { ...BRIGADEIRO, id: "o-empada", slug: "empada-de-palmito", nome: "Empada de palmito", Categoria: "Salgados", destaque: true, pedido_minimo: 1, preco: 6 };

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (tabela: string) => {
      const dados = tabela === "produtos" ? [BRIGADEIRO, EMPADA] : [];
      const b = {
        select: () => b,
        eq: () => b,
        gte: () => b,
        in: () => b,
        order: () => b,
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: dados, error: null }).then(ok),
      };
      return b;
    },
  })),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(() => {
    throw new Error("o checkout não consulta o banco pelo navegador");
  }),
}));

const LINHA: LinhaCarrinho = {
  id: "l-avulso",
  produtoId: "p-brigadeiro",
  slug: "brigadeiro-gourmet",
  nome: "Brigadeiro Gourmet",
  preco: 2.35,
  tipo: "normal",
  unidade_venda: "unidade",
  quantidade: 30,
  pedidoMinimo: 30,
  step: "livre",
  observacao: null,
  foto: null,
};

// Rede simulada. A rota de criação de pedido é interceptada aqui.
type Chamada = { url: string; metodo: string };
let chamadas: Chamada[] = [];
let respostas: (() => Response)[] = [];
const beacon = vi.fn(() => {
  throw new Error("nada de beacon no teste");
});
function respostaJson(status: number, corpo: unknown) {
  return new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
}
function gravado(numero = 1048) {
  return () => respostaJson(201, { numero, itens: [{ valor_centavos: 7050 }], subtotal_centavos: 7050, total_centavos: 7050 });
}
const falha = () => respostaJson(500, { erro: "falha" });

function eventos(): [string, unknown][] {
  return (window.dataLayer ?? [])
    .map((a) => Array.from(a as ArrayLike<unknown>))
    .filter((c) => c[0] === "event")
    .map((c) => [c[1] as string, c[2]]);
}
const nomes = () => eventos().map((e) => e[0]);
const semNavegar = (e: Event) => {
  if (e.target instanceof Element && e.target.closest("a[href^=\"https://wa.me/\"]")) e.preventDefault();
};

async function abrir() {
  window.localStorage.setItem(CHAVE_CARRINHO, escreverCarrinho([LINHA]));
  reiniciarParaTeste();
  const { default: CheckoutPage } = await import("./page");
  const ui = await CheckoutPage();
  return render(
    <CarrinhoProvider>
      <ConsentimentoProvider>
        <Analitica />
        {ui}
      </ConsentimentoProvider>
    </CarrinhoProvider>
  );
}
// Recarregar a aba: a memória da página zera; o sessionStorage fica.
async function recarregar() {
  cleanup();
  reiniciarAnaliticaParaTeste();
  reiniciarRetratoParaTeste();
  reiniciarConsentimentoParaTeste();
  return abrir();
}

async function preencherTudo(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/^Seu nome/), "Cliente Inventada");
  await user.type(screen.getByLabelText(/^Seu WhatsApp/), "41900000000");
  await user.click(screen.getByRole("checkbox", { name: /^Li e estou ciente da Política de Privacidade/ }));
  await user.click(within(screen.getByRole("grid")).getByRole("button", { name: /^sábado, 3 de outubro/ }));
  await user.selectOptions(screen.getByLabelText(/^Horário em que precisa/), "14:00");
  await user.click(screen.getByRole("radio", { name: /Retirar na loja/ }));
  await user.click(screen.getByRole("radio", { name: "Pix" }));
}
const fazerPedido = () => screen.getByRole("button", { name: "Fazer pedido" });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-02T01:30:00Z")); // quinta 01/10, 22h30 em Brasília
  window.localStorage.clear();
  window.sessionStorage.clear();
  reiniciarRetratoParaTeste();
  reiniciarConsentimentoParaTeste();
  reiniciarAnaliticaParaTeste();
  push.mockClear();
  vi.stubEnv("GA4_ID", "G-TESTE00000");
  vi.stubEnv("CONTEXTO_NETLIFY", "branch-deploy");
  window.localStorage.setItem(CHAVE_CONSENTIMENTO, JSON.stringify({ versao: 1, escolha: "aceito", data: "2026-10-01", versaoPolitica: 2 }));
  chamadas = [];
  respostas = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      chamadas.push({ url: String(url), metodo: init?.method ?? "GET" });
      if (url !== "/api/pedidos" || init?.method !== "POST") throw new Error(`rede inesperada: ${url}`);
      const proxima = respostas.shift();
      if (!proxima) throw new Error("resposta da rota não preparada");
      return proxima();
    })
  );
  vi.stubGlobal("XMLHttpRequest", function XMLHttpRequest() {
    throw new Error("XHR não é usado");
  });
  Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: beacon });
  window.addEventListener("click", semNavegar);
});

afterEach(() => {
  // Prova de que nenhuma escrita saiu do navegador de teste: as únicas
  // chamadas foram à rota de pedido simulada acima; nenhuma à Supabase,
  // nenhum beacon, nenhum cliente do banco no navegador.
  for (const c of chamadas) expect(c).toEqual({ url: "/api/pedidos", metodo: "POST" });
  expect(chamadas.some((c) => c.url.includes("supabase"))).toBe(false);
  expect(beacon).not.toHaveBeenCalled();
  expect(clienteDoNavegador).not.toHaveBeenCalled();
  window.removeEventListener("click", semNavegar);
  cleanup();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  reiniciarAnaliticaParaTeste();
});

describe("begin_checkout", () => {
  it("uma vez ao abrir o formulário com o carrinho, sem parâmetros; nenhuma requisição", async () => {
    await abrir();
    await screen.findByRole("button", { name: "Fazer pedido" });
    expect(eventos().filter((e) => e[0] === "begin_checkout")).toEqual([["begin_checkout", {}]]);
    expect(chamadas).toEqual([]);
  });

  it("a chave sobrevive ao recarregamento (sessionStorage); a guarda é da memória, então recarregar manda de novo", async () => {
    await abrir();
    await screen.findByRole("button", { name: "Fazer pedido" });
    const chave = window.sessionStorage.getItem(CHAVE_IDEMPOTENCIA);
    expect(chave).toMatch(/^[0-9a-f-]{36}$/);

    await recarregar();
    await screen.findByRole("button", { name: "Fazer pedido" });
    expect(window.sessionStorage.getItem(CHAVE_IDEMPOTENCIA)).toBe(chave);
    expect(nomes().filter((n) => n === "begin_checkout")).toEqual(["begin_checkout"]);
  });

  it("carrinho vazio: sem formulário, sem begin_checkout", async () => {
    reiniciarParaTeste();
    const { default: CheckoutPage } = await import("./page");
    const ui = await CheckoutPage();
    render(
      <CarrinhoProvider>
        <ConsentimentoProvider>{ui}</ConsentimentoProvider>
      </CarrinhoProvider>
    );
    await screen.findByRole("heading", { level: 1 });
    expect(window.dataLayer).toBeUndefined();
  });
});

describe("add_to_cart pela oferta do checkout", () => {
  it("só slug e nome do produto, sem preço, quantidade ou valor", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await abrir();
    const oferta = await screen.findByRole("button", { name: /Adicionar.*Empada de palmito|Empada de palmito.*Adicionar|^Adicionar/ });
    await user.click(oferta);
    expect(eventos().filter((e) => e[0] === "add_to_cart")).toEqual([
      ["add_to_cart", { items: [{ item_id: "empada-de-palmito", item_name: "Empada de palmito" }] }],
    ]);
  });
});

describe("saída de emergência (Enviar pelo WhatsApp sem registrar)", () => {
  it("pedido_enviado uma vez por chave, mesmo com vários cliques; whatsapp_clique a cada clique; o mesmo pedido gravado depois não conta de novo", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await abrir();
    await preencherTudo(user);
    respostas.push(falha, falha);
    await user.click(fazerPedido());
    await user.click(await screen.findByRole("button", { name: "Tentar de novo" }));
    const saida = await screen.findByRole("link", { name: /^Enviar pelo WhatsApp sem registrar/ });
    expect(saida).toHaveAttribute("data-whatsapp-origem", "saida_sem_registro");
    expect(saida).toHaveAttribute("target", "_blank");

    await user.click(saida);
    await user.click(saida);
    expect(eventos().filter((e) => ["pedido_enviado", "whatsapp_clique"].includes(e[0]))).toEqual([
      ["whatsapp_clique", { origem: "saida_sem_registro" }],
      ["pedido_enviado", {}],
      ["whatsapp_clique", { origem: "saida_sem_registro" }],
    ]);

    // Agora a gravação funciona com a mesma chave: o retrato nasce com o
    // pedido_enviado já marcado.
    respostas.push(gravado());
    await user.click(screen.getByRole("button", { name: "Tentar de novo" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/confirmacao"));
    expect(lerRetrato()?.medido).toEqual({ exibida: false, enviado: true });
    expect(chamadas).toHaveLength(3);

    // Nenhum evento leva a mensagem, a URL do wa.me, nome, telefone ou valor.
    const tudo = JSON.stringify(eventos());
    expect(tudo).not.toContain("wa.me");
    expect(tudo).not.toContain("Cliente Inventada");
    expect(tudo).not.toContain("41900000000");
    expect(tudo).not.toMatch(/valor|total|preco|price|value|currency/);
  });
});
