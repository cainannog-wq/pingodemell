// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { SiteChrome } from "@/components/site/SiteChrome";
import { reiniciarParaTeste } from "@/lib/carrinho/armazenamento";

// O que o site público guarda no navegador. A Política de Privacidade
// (seções 2 e 8) diz que são só o carrinho (localStorage) e o formulário do
// checkout (sessionStorage). Qualquer chave ou cookie novo quebra este
// teste: aí o texto da política precisa de versão nova ANTES do merge.

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
  it("Home → Lista → interna → carrinho → checkout → Política: só pdm-carrinho-v1 e pdm-checkout-v1, sem cookie", async () => {
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
      sessionStorage: ["pdm-checkout-v1"],
      cookies: "",
    });
  });

  it("no código do site público, só o carrinho e o rascunho do checkout mexem no armazenamento do navegador", () => {
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
    expect(usam).toEqual(["lib/carrinho/armazenamento.ts", "lib/checkout/rascunho.ts"]);
  });
});
