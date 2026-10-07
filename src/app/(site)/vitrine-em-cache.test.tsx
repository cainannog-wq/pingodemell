// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProdutoVitrine } from "@/lib/vitrine/mais-pedidos";
import { clienteSimulado, novoBanco, type BancoSimulado } from "@/test/banco-simulado";

// Home e interna em cache (PR perf/vitrine-consultas-cache), com o banco
// simulado (nada real):
// - Home: falha de "Os mais pedidos" é capturada só em volta dessa leitura,
//   e a Home sai sem a seção, como sempre; inclusive sem as variáveis de
//   ambiente do Supabase (um build sem acesso ao banco não quebra);
// - interna: falha do banco lança erro (o Next mantém a versão anterior);
//   sem versão anterior, o error.tsx mostra a frase de sempre.

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

const publico = vi.hoisted(() => ({ semVariaveis: false }));
let banco: BancoSimulado;
vi.mock("@/lib/supabase/publico", () => ({
  createPublicClient: vi.fn(() => {
    // O mesmo erro de src/lib/supabase/env.ts quando a variável não existe.
    if (publico.semVariaveis) throw new Error("Missing environment variable: SUPABASE_URL");
    return clienteSimulado(banco);
  }),
}));

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

let erroNoLog: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  publico.semVariaveis = false;
  banco = novoBanco({ produtos: [BRIGADEIRO], produto_cento_itens: [], produto_fotos: [], recheios: [] });
  erroNoLog = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  erroNoLog.mockRestore();
});

async function renderHome() {
  const { default: HomePage } = await import("./page");
  render(await HomePage());
}
const secaoMaisPedidos = () => screen.queryByRole("heading", { level: 2, name: "Os mais pedidos" });

describe("Home em cache", () => {
  it("com o banco no ar, mostra 'Os mais pedidos'", async () => {
    await renderHome();
    expect(secaoMaisPedidos()).toBeInTheDocument();
    expect(screen.getByText("Brigadeiro Gourmet")).toBeInTheDocument();
  });

  it("falha na leitura: a Home é montada sem a seção, sem lançar erro", async () => {
    banco.falhas.add("produtos");
    await renderHome();
    expect(secaoMaisPedidos()).not.toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 }).length).toBeGreaterThan(0);
  });

  it("sem as variáveis de ambiente do Supabase: a Home é montada sem a seção (o build não quebra)", async () => {
    publico.semVariaveis = true;
    await renderHome();
    expect(secaoMaisPedidos()).not.toBeInTheDocument();
    expect(erroNoLog).toHaveBeenCalledWith(expect.stringContaining("Os mais pedidos"), expect.stringContaining("Missing environment variable"));
  });
});

describe("interna em cache", () => {
  it("falha do banco: a página lança erro em vez de montar (e guardar) o aviso", async () => {
    banco.falhas.add("produtos");
    const { default: ProdutoPage } = await import("./produtos/[slug]/page");
    await expect(ProdutoPage({ params: Promise.resolve({ slug: "brigadeiro-gourmet" }) })).rejects.toThrow();
  });

  it("error.tsx (primeira geração com falha) mostra a frase de sempre", async () => {
    const { default: ErroDaInterna } = await import("./produtos/[slug]/error");
    render(<ErroDaInterna />);
    expect(screen.getByText("Não conseguimos carregar este produto agora. Tente de novo em alguns instantes.")).toBeInTheDocument();
  });
});
