// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ListaProdutos } from "@/app/(site)/produtos/_lista/ListaProdutos";
import { SiteHeader } from "@/components/site/SiteHeader";
import type { ProdutoVitrine } from "@/lib/vitrine/mais-pedidos";

// Carregamento da primeira tela (PR fase4/primeira-tela-e-contraste): o que
// está sempre na primeira tela não é preguiçoso. O next/image simulado
// repassa só as propriedades de carregamento, para o teste ver o que cada
// componente pede (o next/image de verdade transforma isso nos atributos
// loading e fetchpriority do <img>).
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={props.alt as string}
      src={props.src as string}
      data-loading={(props.loading as string) ?? "padrao"}
      data-fetchpriority={(props.fetchPriority as string) ?? "padrao"}
      data-preload={props.preload ? "sim" : "nao"}
      data-priority={props.priority ? "sim" : "nao"}
    />
  ),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/components/site/CarrinhoProvider", () => ({
  useCarrinho: () => ({ totalItens: 0 }),
}));

// O jsdom não tem os métodos do <dialog> (menu do cabeçalho).
HTMLDialogElement.prototype.close ??= function close() {};
HTMLDialogElement.prototype.showModal ??= function showModal() {};

afterEach(cleanup);

function produto(n: number): ProdutoVitrine {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    slug: `produto-${n}`,
    nome: `Produto ${n}`,
    descricao: null,
    preco: 10,
    image_url: `https://exemplo.supabase.co/storage/v1/object/public/f${n}.jpg`,
    Categoria: "Doces",
    tipo: "normal",
    unidade_venda: null,
    pedido_minimo: 1,
    step_quantidade: "livre",
    ativo: true,
    destaque: false,
    atualizado_em: "2026-09-23T14:29:18.070Z",
  };
}

describe("Primeira tela — Lista", () => {
  it("os 2 primeiros cards (primeira linha no celular) carregam já e com prioridade alta; os outros, preguiçosos", () => {
    render(<ListaProdutos categoria={null} itens={[1, 2, 3, 4].map((n) => ({ produto: produto(n), maisPedido: false }))} />);
    const fotos = [1, 2, 3, 4].map((n) => screen.getByAltText(`Foto de Produto ${n}`));
    for (const foto of fotos.slice(0, 2)) {
      expect(foto).toHaveAttribute("data-loading", "eager");
      expect(foto).toHaveAttribute("data-fetchpriority", "high");
    }
    for (const foto of fotos.slice(2)) {
      expect(foto).toHaveAttribute("data-loading", "padrao");
      expect(foto).toHaveAttribute("data-fetchpriority", "padrao");
    }
  });
});

describe("Primeira tela — cabeçalho", () => {
  it("o logo do cabeçalho carrega já e com prioridade alta; o logo do menu fechado continua preguiçoso", () => {
    const { container } = render(<SiteHeader />);
    const logo = container.querySelector('img[src="/logo-gold.png"]');
    expect(logo).toHaveAttribute("data-loading", "eager");
    expect(logo).toHaveAttribute("data-fetchpriority", "high");
    const logoMenu = container.querySelector('img[src="/logo-mono-cream.png"]');
    expect(logoMenu).toHaveAttribute("data-loading", "padrao");
  });
});

describe("Primeira tela — propriedade obsoleta", () => {
  it("nenhum componente usa `priority` do next/image (obsoleta no Next 16; o substituto é `preload`)", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const achados: string[] = [];
    const varrer = (pasta: string) => {
      for (const nome of readdirSync(pasta)) {
        const caminho = join(pasta, nome);
        if (statSync(caminho).isDirectory()) varrer(caminho);
        else if (caminho.endsWith(".tsx") && !caminho.includes(".test.")) {
          if (/^\s*priority(=|\s*$)/m.test(readFileSync(caminho, "utf8"))) achados.push(caminho);
        }
      }
    };
    varrer(join(process.cwd(), "src"));
    expect(achados).toEqual([]);
  });
});
