// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { SiteChrome } from "@/components/site/SiteChrome";
import { reiniciarParaTeste } from "@/lib/carrinho/armazenamento";
import { CHAVE_CONSENTIMENTO, reiniciarConsentimentoParaTeste } from "@/lib/consentimento/consentimento";
import { CHAVE_IDEMPOTENCIA, CHAVE_RETRATO } from "@/lib/pedidos/retrato";

// O que o site público guarda no navegador. A Política de Privacidade
// (seção 2.5 e primeiro parágrafo da seção 8) diz que são só o carrinho
// (localStorage), o formulário do checkout, o resumo do pedido enviado
// (pdm-pedido-enviado-v1, lido pela /confirmacao) e o código que evita
// pedido duplicado (pdm-checkout-chave-v1, uuid sem dado pessoal), os três
// no sessionStorage. Qualquer outra chave ou cookie quebra este teste.
//
// Exceção conhecida (PR 2 da Fase 4): com ID do GA4 efetivo, o banner de
// consentimento grava pdm-consentimento-v1 e, com o aceite, a etiqueta grava
// os cookies _ga. A Política v2 (PR 5 da Fase 4) descreve isso na seção 8.
// Desde ela, a trava por versão (src/lib/analitica/id.ts) não segura mais a
// produção: o banner só não aparece lá porque a GA4_ID não existe no
// contexto de produção da Netlify. Sem ID, nada disso existe, e os
// percursos abaixo provam isso.

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
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error("404");
  },
}));

// Banco simulado mínimo (nada real): responde a qualquer filtro com as
// linhas da tabela que batem nos "eq".
const COCA = {
  id: "00000000-0000-4000-8000-000000000001",
  slug: "coca-cola-2l",
  nome: "Coca-cola 2L",
  descricao: null,
  preco: 11,
  image_url: null,
  Categoria: "Bebidas",
  tipo: "normal",
  unidade_venda: null,
  pedido_minimo: 1,
  step_quantidade: "livre",
  ativo: true,
  destaque: true,
  prazo_producao_dias: 1,
  atualizado_em: "2026-09-23T14:29:18.070Z",
};
const TABELAS: Record<string, Record<string, unknown>[]> = { produtos: [COCA] };
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (tabela: string) => {
      const filtros: [string, unknown][] = [];
      const linhas = () => (TABELAS[tabela] ?? []).filter((l) => filtros.every(([c, v]) => l[c] === v));
      const b = {
        select: () => b,
        eq: (c: string, v: unknown) => (filtros.push([c, v]), b),
        in: () => b,
        gte: () => b,
        order: () => b,
        maybeSingle: async () => ({ data: linhas()[0] ?? null, error: null }),
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: linhas(), error: null }).then(ok),
      };
      return b;
    },
    storage: { from: () => ({ getPublicUrl: (c: string) => ({ data: { publicUrl: `https://storage/${c}` } }) }) },
  })),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(() => {
    throw new Error("o site público não consulta o banco pelo navegador");
  }),
}));

afterEach(() => {
  vi.unstubAllEnvs();
});

// Sem ID do GA4 (o estado da produção hoje): nenhuma chave nova.
function semGa4() {
  vi.stubEnv("GA4_ID", "");
  vi.stubEnv("CONTEXTO_NETLIFY", "branch-deploy");
  reiniciarConsentimentoParaTeste();
}

beforeAll(() => {
  // O jsdom não implementa <dialog> (menu do cabeçalho).
  HTMLDialogElement.prototype.close ??= function () {};
  HTMLDialogElement.prototype.showModal ??= function () {};
});

// Comentário que cita "localStorage." não é uso.
function semComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/.*$/gm, "");
}

function estadoDoNavegador() {
  return {
    localStorage: Object.keys(window.localStorage).sort(),
    sessionStorage: Object.keys(window.sessionStorage).sort(),
    cookies: document.cookie,
  };
}

async function visitar(pagina: string, ui: ReactNode) {
  cleanup();
  render(<SiteChrome>{ui}</SiteChrome>);
  await screen.findByRole("contentinfo");
  // Deixa os efeitos do navegador (useEffect, loja do carrinho) rodarem.
  await new Promise((r) => setTimeout(r, 0));
  console.log(`[armazenamento] depois de ${pagina}:`, JSON.stringify(estadoDoNavegador()));
}

describe("Armazenamento do navegador no site público", () => {
  it("sem ID do GA4, Home → Lista → interna → carrinho → checkout → Política: só pdm-carrinho-v1, pdm-checkout-v1 e pdm-checkout-chave-v1, sem cookie", async () => {
    semGa4();
    window.localStorage.clear();
    window.sessionStorage.clear();
    reiniciarParaTeste();
    const user = userEvent.setup();

    const { default: HomePage } = await import("./page");
    await visitar("Home", await HomePage());

    const { default: ListaPage } = await import("./produtos/page");
    await visitar("Lista", await ListaPage({ searchParams: Promise.resolve({}) }));

    const { default: ProdutoPage } = await import("./produtos/[slug]/page");
    await visitar("interna (antes de adicionar)", await ProdutoPage({ params: Promise.resolve({ slug: COCA.slug }) }));
    const resumo = document.querySelector(".interna-resumo") as HTMLElement;
    await user.click(within(resumo).getByRole("button", { name: "Adicionar ao pedido" }));
    console.log("[armazenamento] depois de adicionar ao pedido:", JSON.stringify(estadoDoNavegador()));

    const { default: CarrinhoPage } = await import("./carrinho/page");
    await visitar("carrinho", <CarrinhoPage />);
    expect(screen.getAllByText("Coca-cola 2L").length).toBeGreaterThan(0);

    const { default: CheckoutPage } = await import("./checkout/page");
    await visitar("checkout (aberto)", await CheckoutPage());
    await user.type(screen.getByLabelText(/^Seu nome completo/), "Teste");
    console.log("[armazenamento] depois de digitar no checkout:", JSON.stringify(estadoDoNavegador()));

    const { default: PoliticaPage } = await import("./politica-de-privacidade/page");
    await visitar("Política", <PoliticaPage />);

    expect(estadoDoNavegador()).toEqual({
      localStorage: ["pdm-carrinho-v1"],
      // pdm-checkout-chave-v1 nasce ao abrir o checkout. O retrato
      // (pdm-pedido-enviado-v1) só existe depois de enviar: o envio fica no
      // teste do checkout e da confirmação, e a varredura abaixo pega o arquivo.
      sessionStorage: ["pdm-checkout-chave-v1", "pdm-checkout-v1"],
      cookies: "",
    });
  });

  it("sem ID do GA4, Home → Quem Somos → Home não cria nem apaga chave nem cookie", async () => {
    semGa4();
    window.localStorage.clear();
    window.sessionStorage.clear();
    reiniciarParaTeste();
    const user = userEvent.setup();

    // Com um item no carrinho, para ver que a Quem Somos também não apaga.
    const { default: ProdutoPage } = await import("./produtos/[slug]/page");
    await visitar("interna", await ProdutoPage({ params: Promise.resolve({ slug: COCA.slug }) }));
    const resumo = document.querySelector(".interna-resumo") as HTMLElement;
    await user.click(within(resumo).getByRole("button", { name: "Adicionar ao pedido" }));

    const { default: HomePage } = await import("./page");
    await visitar("Home", await HomePage());
    const antes = estadoDoNavegador();
    expect(antes).toEqual({ localStorage: ["pdm-carrinho-v1"], sessionStorage: [], cookies: "" });

    const { default: QuemSomosPage } = await import("./quem-somos/page");
    await visitar("Quem Somos", <QuemSomosPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Somos a Pingo de Mell" })).toBeInTheDocument();
    expect(estadoDoNavegador()).toEqual(antes);

    await visitar("Home de novo", await HomePage());
    expect(estadoDoNavegador()).toEqual(antes);
  });

  it("no código do site público, só o carrinho, o rascunho do checkout e o retrato do pedido enviado mexem no armazenamento do navegador", () => {
    // Varredura do código (fora admin e testes): complementa o percurso
    // acima para pegar armazenamento em página que ele não visita.
    const raiz = path.join(process.cwd(), "src");
    const arquivos: string[] = [];
    const andar = (dir: string) => {
      for (const nome of readdirSync(dir)) {
        const p = path.join(dir, nome);
        if (statSync(p).isDirectory()) andar(p);
        else if (/\.(ts|tsx)$/.test(nome) && !/\.test\.(ts|tsx)$/.test(nome)) arquivos.push(p);
      }
    };
    andar(raiz);
    const usam = arquivos
      .map((p) => path.relative(raiz, p).split(path.sep).join("/"))
      .filter((rel) => !rel.startsWith("app/admin/") && !rel.startsWith("lib/admin/") && !rel.startsWith("components/admin/"))
      .filter((rel) =>
        // Só APIs do navegador. O cookie de sessão do admin (Supabase,
        // src/lib/supabase/) é gravado pelo servidor e só existe para quem
        // faz login no painel; a visitante não recebe Set-Cookie.
        /\b(localStorage|sessionStorage|indexedDB)\s*\.|document\.cookie/.test(
          semComentarios(readFileSync(path.join(raiz, rel), "utf8"))
        )
      )
      .sort();
    console.log("[armazenamento] arquivos do site que usam armazenamento do navegador:", usam);
    expect(usam).toEqual([
      // Só apaga os cookies _ga na revogação (recusar depois de aceitar);
      // os cookies são da etiqueta do GA4, com ID efetivo e aceite.
      "lib/analitica/gtag.ts",
      "lib/carrinho/armazenamento.ts",
      "lib/checkout/rascunho.ts",
      // Só com ID do GA4 efetivo (ver o comentário do topo).
      "lib/consentimento/consentimento.ts",
      "lib/pedidos/retrato.ts",
    ]);
  });

  it("com ID do GA4, o aceite cria só pdm-consentimento-v1, sem cookie", async () => {
    vi.stubEnv("GA4_ID", "G-TESTE00000");
    vi.stubEnv("CONTEXTO_NETLIFY", "branch-deploy");
    reiniciarConsentimentoParaTeste();
    window.localStorage.clear();
    window.sessionStorage.clear();
    reiniciarParaTeste();

    const { default: QuemSomosPage } = await import("./quem-somos/page");
    await visitar("Quem Somos com ID", <QuemSomosPage />);
    // Antes da escolha: nada gravado.
    expect(estadoDoNavegador()).toEqual({ localStorage: [], sessionStorage: [], cookies: "" });
    await userEvent.setup().click(screen.getByRole("button", { name: "Aceitar" }));
    await new Promise((r) => setTimeout(r, 0));
    expect(estadoDoNavegador()).toEqual({ localStorage: [CHAVE_CONSENTIMENTO], sessionStorage: [], cookies: "" });
  });

  it("as chaves de sessionStorage do envio são exatamente pdm-pedido-enviado-v1 e pdm-checkout-chave-v1", () => {
    // Descritas na Política, seção 2.5 e primeiro parágrafo da seção 8.
    expect([CHAVE_RETRATO, CHAVE_IDEMPOTENCIA]).toEqual(["pdm-pedido-enviado-v1", "pdm-checkout-chave-v1"]);
  });
});
