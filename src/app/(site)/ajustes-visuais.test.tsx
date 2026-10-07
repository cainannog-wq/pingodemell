// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SiteChrome } from "@/components/site/SiteChrome";
import { reiniciarAnaliticaParaTeste } from "@/lib/analitica/gtag";
import { reiniciarParaTeste } from "@/lib/carrinho/armazenamento";
import { reiniciarConsentimentoParaTeste } from "@/lib/consentimento/consentimento";
import { reiniciarRetratoParaTeste } from "@/lib/pedidos/retrato";
import type { ProdutoVitrine } from "@/lib/vitrine/mais-pedidos";
import { clienteSimulado, novoBanco, type BancoSimulado } from "@/test/banco-simulado";

// PR de ajustes visuais (07/10/2026), com o banco simulado (nada real):
// - Home: o destaque perde "Peça pelo WhatsApp" e o texto de prazos (fica
//   "Quero encomendar"); "Como funciona" perde a frase dos quatro passos; a
//   seção id="prazos" continua;
// - rodapé (o mesmo componente em todas as páginas, montado pelo layout):
//   só Produtos, Sobre nós e Política de privacidade, sem o botão
//   "Preferências de privacidade", na Home, no checkout, na confirmação e na
//   Política;
// - Política: o botão aparece só na seção 8, com o GA4 habilitado.
// As chaves do navegador seguem conferidas em armazenamento-navegador.test.tsx.

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
const caminho = vi.hoisted(() => ({ atual: "/" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => caminho.atual,
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error("404");
  },
}));

let banco: BancoSimulado;
vi.mock("@/lib/supabase/publico", () => ({ createPublicClient: vi.fn(() => clienteSimulado(banco)) }));
// Checkout: leitura mínima (só produtos; dias off, sabores e recheios vazios).
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (tabela: string) => {
      const b = {
        select: () => b,
        eq: () => b,
        gte: () => b,
        in: () => b,
        order: () => b,
        then: (ok: (v: unknown) => unknown) =>
          Promise.resolve({ data: tabela === "produtos" ? [BRIGADEIRO] : [], error: null }).then(ok),
      };
      return b;
    },
  })),
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn(() => clienteSimulado(banco)) }));

const BRIGADEIRO: ProdutoVitrine = {
  id: "3f1c9a52-0000-4000-8000-000000000001",
  slug: "brigadeiro-gourmet",
  nome: "Brigadeiro Gourmet",
  descricao: null,
  preco: 2.35,
  image_url: null,
  Categoria: "Doces",
  tipo: "normal",
  unidade_venda: "unidade",
  pedido_minimo: 1,
  step_quantidade: "livre",
  ativo: true,
  destaque: true,
  atualizado_em: "2026-09-23T14:29:18.070Z",
};

beforeAll(() => {
  HTMLDialogElement.prototype.close ??= function () {};
  HTMLDialogElement.prototype.showModal ??= function () {};
});
beforeEach(() => {
  banco = novoBanco({ produtos: [BRIGADEIRO], produto_cento_itens: [], produto_fotos: [], recheios: [], dias_off: [] });
  window.localStorage.clear();
  window.sessionStorage.clear();
  reiniciarParaTeste();
  reiniciarConsentimentoParaTeste();
  reiniciarAnaliticaParaTeste();
  reiniciarRetratoParaTeste();
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  reiniciarAnaliticaParaTeste();
});

// Hífen, hífen tipográfico, hífen não separável, sinal de menos e os dois travessões.
const HIFEN_OU_TRAVESSAO = /[-‐‑−–—]/;

async function pagina(rota: "/" | "/checkout" | "/confirmacao" | "/politica-de-privacidade"): Promise<ReactNode> {
  caminho.atual = rota;
  if (rota === "/") return (await import("./page")).default();
  if (rota === "/checkout") return (await import("./checkout/page")).default();
  if (rota === "/confirmacao") {
    const { default: Confirmacao } = await import("./confirmacao/page");
    return <Confirmacao />;
  }
  const { default: Politica } = await import("./politica-de-privacidade/page");
  return <Politica />;
}

async function abrir(rota: Parameters<typeof pagina>[0]) {
  const ui = await pagina(rota);
  return render(<SiteChrome>{ui}</SiteChrome>);
}

function comGa4() {
  vi.stubEnv("GA4_ID", "G-TESTE00000");
  vi.stubEnv("CONTEXTO_NETLIFY", "branch-deploy");
}

describe("Home: destaque e Como funciona", () => {
  it("destaque só com 'Quero encomendar', sem 'Peça pelo WhatsApp' e sem o texto de prazos (desktop e celular)", async () => {
    await abrir("/");
    const destaque = document.querySelector(".home-hero") as HTMLElement;
    expect(within(destaque).getByRole("link", { name: /Quero encomendar/ })).toHaveAttribute("href", "/produtos");
    expect(destaque).not.toHaveTextContent("Peça pelo WhatsApp");
    expect(destaque.querySelector('a[href^="https://wa.me/"]')).toBeNull();
    expect(destaque).not.toHaveTextContent("Dias de semana: pedidos com 1 dia de antecedência");
    expect(destaque).not.toHaveTextContent("Fins de semana: pedidos até quinta-feira.");
    expect(destaque).not.toHaveTextContent("1 dia de antecedência · fim de semana, até quinta.");
    expect(destaque.querySelector(".home-hero-note")).toBeNull();
    expect(destaque.querySelectorAll(".home-hero-ctas a")).toHaveLength(1);
    // O WhatsApp de contato continua no botão flutuante e no menu.
    expect(document.querySelector('.site-fab[href^="https://wa.me/"]')).not.toBeNull();
  });

  it("'Como funciona o seu pedido' sem a frase dos quatro passos; título e passos mantidos", async () => {
    await abrir("/");
    const secao = screen.getByRole("region", { name: "Como funciona o seu pedido" });
    expect(secao).not.toHaveTextContent("Quatro passos. O último acontece no WhatsApp, com uma pessoa da nossa equipe.");
    expect(secao.querySelector(".home-como-lead")).toBeNull();
    expect(within(secao).getAllByRole("listitem")).toHaveLength(4);
  });

  it("a seção id=\"prazos\" (Combinado desde já) continua na Home", async () => {
    await abrir("/");
    expect(document.getElementById("prazos")).not.toBeNull();
  });

  it("textos que ficam no destaque e no Como funciona sem hífen nem travessão novos", async () => {
    await abrir("/");
    const botao = within(document.querySelector(".home-hero") as HTMLElement).getByRole("link", { name: /Quero encomendar/ });
    expect(botao.textContent).not.toMatch(HIFEN_OU_TRAVESSAO);
    const head = document.querySelector(".home-como-head") as HTMLElement;
    expect(head.textContent).not.toMatch(HIFEN_OU_TRAVESSAO);
  });
});

describe("Rodapé: só Produtos, Sobre nós e Política de privacidade", () => {
  it.each(["/", "/checkout", "/confirmacao", "/politica-de-privacidade"] as const)("%s (com o GA4 habilitado)", async (rota) => {
    comGa4();
    await abrir(rota);
    const rodape = screen.getByRole("navigation", { name: "Rodapé" });
    await waitFor(() => expect(document.querySelector(".site-consentimento")).not.toBeNull());
    expect(within(rodape).getAllByRole("link").map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["Produtos", "/produtos"],
      ["Sobre nós", "/quem-somos"],
      ["Política de privacidade", "/politica-de-privacidade"],
    ]);
    expect(within(rodape).queryByRole("button")).toBeNull();
    const footer = document.querySelector("footer") as HTMLElement;
    expect(footer).not.toHaveTextContent("Preferências de privacidade");
    expect(footer).not.toHaveTextContent(/Prazos|Contato/);
    for (const a of within(rodape).getAllByRole("link")) expect(a.textContent).not.toMatch(HIFEN_OU_TRAVESSAO);
  });

  it("o 'Contato' do cabeçalho continua levando à seção de contato da Quem Somos", async () => {
    await abrir("/");
    const menu = screen.getByRole("navigation", { name: "Principal" });
    expect(within(menu).getByRole("link", { name: /Contato/ })).toHaveAttribute("href", "/quem-somos#contato");
  });
});

describe("Preferências de privacidade: só na seção 8 da Política", () => {
  it("com o GA4 habilitado: um botão, dentro da seção 8, logo depois do parágrafo que o cita", async () => {
    comGa4();
    await abrir("/politica-de-privacidade");
    const botao = await screen.findByRole("button", { name: "Preferências de privacidade" });
    expect(screen.getAllByRole("button", { name: "Preferências de privacidade" })).toHaveLength(1);
    const secao8 = document.getElementById("cookies") as HTMLElement;
    expect(secao8).toContainElement(botao);
    const paragrafo = Array.from(secao8.querySelectorAll("p")).find((p) => p.textContent?.includes("O Titular pode alterar sua escolha"))!;
    expect(paragrafo.nextElementSibling).toContainElement(botao);
    expect(botao.tagName).toBe("BUTTON");
    expect(botao).toHaveAttribute("type", "button");
  });

  it.each(["/", "/checkout", "/confirmacao"] as const)("com o GA4 habilitado, ausente em %s", async (rota) => {
    comGa4();
    await abrir(rota);
    await waitFor(() => expect(document.querySelector(".site-consentimento")).not.toBeNull());
    expect(screen.queryByRole("button", { name: "Preferências de privacidade" })).toBeNull();
  });

  it("sem o GA4 habilitado: ausente na Política e no rodapé", async () => {
    vi.stubEnv("GA4_ID", "");
    await abrir("/politica-de-privacidade");
    expect(screen.queryByRole("button", { name: "Preferências de privacidade" })).toBeNull();
    expect(document.querySelector("footer")).not.toHaveTextContent("Preferências de privacidade");
  });

  it("frase da seção 8 exatamente como aprovada, e um H1 e dez H2 na Política", async () => {
    await abrir("/politica-de-privacidade");
    const artigo = document.querySelector("article.politica") as HTMLElement;
    const secao8 = document.getElementById("cookies") as HTMLElement;
    const frase =
      'O Titular pode alterar sua escolha a qualquer tempo, pelo botão "Preferências de privacidade", disponível nesta página sempre que a ferramenta de análise estiver habilitada.';
    const paragrafo = Array.from(secao8.querySelectorAll("p")).find((p) => p.textContent?.includes("O Titular pode alterar sua escolha"))!;
    expect(paragrafo.textContent!.replace(/\s+/g, " ").startsWith(frase + " ")).toBe(true);
    expect(artigo).not.toHaveTextContent("rodapé");
    expect(frase).not.toMatch(HIFEN_OU_TRAVESSAO);
    expect(artigo.querySelectorAll("h1")).toHaveLength(1);
    expect(artigo.querySelectorAll("h2")).toHaveLength(10);
  });
});
