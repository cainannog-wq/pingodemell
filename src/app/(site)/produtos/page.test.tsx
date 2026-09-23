// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProdutoVitrine } from "@/lib/vitrine/mais-pedidos";

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
}));

// "Banco" simulado: devolve o que estiver em `doBanco`, sem ler nada real.
let doBanco: ProdutoVitrine[] = [];
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: () => {
      const b = {
        select: () => b,
        eq: () => b,
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: doBanco, error: null }).then(ok),
      };
      return b;
    },
  })),
}));

let seq = 0;
function produto(parcial: Partial<ProdutoVitrine>): ProdutoVitrine {
  seq += 1;
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    nome: `Produto ${seq}`,
    descricao: null,
    preco: 10,
    image_url: null,
    Categoria: "Doces",
    tipo: "normal",
    ativo: true,
    destaque: false,
    atualizado_em: "2026-09-23T14:29:18.070Z",
    ...parcial,
  };
}

const COM_FOTO = "https://exemplo.supabase.co/storage/v1/object/public/f.jpg";

const CATALOGO = [
  produto({ nome: "Bolo de Chocolate", Categoria: "Bolos", preco: 45, image_url: COM_FOTO }),
  produto({ nome: "Beijinho", Categoria: "Doces", preco: 100, tipo: "cento", destaque: true }),
  produto({ nome: "Coca-cola 2L", Categoria: "Bebidas", preco: 11, destaque: true }),
  produto({ nome: "Morango Banhado", Categoria: "Doces", preco: 2.5 }),
  produto({ nome: "Empada", Categoria: "Salgados", preco: 4.5 }),
  produto({ nome: "Kit Festa", Categoria: null, preco: 150 }),
  produto({ nome: "Torta Inativa", Categoria: "Doces", ativo: false }),
];

async function renderLista(categoria?: string) {
  const { default: ListaPage } = await import("./page");
  const ui = await ListaPage({ searchParams: Promise.resolve(categoria === undefined ? {} : { categoria }) });
  return render(ui);
}

const cardsNaOrdem = () => screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
const cardDe = (nome: string) => screen.getByRole("heading", { level: 3, name: nome }).closest("article")!;
const filtroAtual = () => within(screen.getByRole("navigation", { name: "Categorias" })).getAllByRole("link").find((a) => a.getAttribute("aria-current") === "page");

beforeEach(() => {
  doBanco = CATALOGO;
});
afterEach(cleanup);

describe("Página Lista — estrutura", () => {
  it("tem um único H1 com o texto do layout", async () => {
    await renderLista();
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent("Nosso catálogo");
  });

  it("'Todos': grade única sem subtítulo visível, destaques primeiro, filtro 'Todos' marcado", async () => {
    await renderLista();
    const h2s = screen.getAllByRole("heading", { level: 2 });
    expect(h2s).toHaveLength(1);
    expect(h2s[0]).toHaveTextContent("Todos os produtos");
    expect(h2s[0]).toHaveClass("site-visually-hidden");
    expect(cardsNaOrdem()).toEqual(["Beijinho", "Bolo de Chocolate", "Coca-cola 2L", "Empada", "Kit Festa", "Morango Banhado"]);
    expect(filtroAtual()).toHaveAttribute("href", "/produtos");
    expect(screen.queryByText("Torta Inativa")).not.toBeInTheDocument();
  });

  it("filtrada: mesma regra, sem subtítulo visível e filtro da categoria marcado", async () => {
    await renderLista("doces");
    const h2 = screen.getByRole("heading", { level: 2, name: "Doces" });
    expect(h2).toHaveClass("site-visually-hidden");
    expect(filtroAtual()).toHaveAttribute("href", "/produtos?categoria=doces");
    expect(cardsNaOrdem()).toEqual(["Beijinho", "Morango Banhado"]);
  });

  it("categoria inválida na URL mostra 'Todos', sem erro", async () => {
    await renderLista("kits-festa");
    expect(filtroAtual()).toHaveAttribute("href", "/produtos");
    expect(cardsNaOrdem()).toHaveLength(6);
  });

  it("filtro tem as 4 categorias do CMS mais 'Todos', como links da URL", async () => {
    await renderLista();
    const links = within(screen.getByRole("navigation", { name: "Categorias" })).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/produtos",
      "/produtos?categoria=bolos",
      "/produtos?categoria=doces",
      "/produtos?categoria=salgados",
      "/produtos?categoria=bebidas",
    ]);
    expect(links.filter((a) => a.getAttribute("aria-current") === "page")).toHaveLength(1);
  });
});

describe("Página Lista — categoria vazia", () => {
  it("mostra a mensagem com caminho para 'Todos'", async () => {
    doBanco = CATALOGO.filter((p) => p.Categoria !== "Bebidas");
    await renderLista("bebidas");
    expect(screen.getByText("Ainda não temos produtos nesta categoria.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ver todos os produtos/ })).toHaveAttribute("href", "/produtos");
    expect(screen.queryAllByRole("heading", { level: 3 })).toHaveLength(0);
  });
});

describe("Página Lista — selo 'Mais pedido'", () => {
  it("aparece como texto (lido pelo leitor de tela) só nos destaques que sobem", async () => {
    await renderLista();
    const selos = screen.getAllByText("Mais pedido");
    expect(selos).toHaveLength(1);
    expect(within(cardDe("Beijinho")).getByText("Mais pedido")).toBeVisible();
    // O selo faz parte do nome acessível do link do card.
    const linkDoCard = within(cardDe("Beijinho")).getAllByRole("link")[0];
    expect(linkDoCard).toHaveAccessibleName(expect.stringContaining("Mais pedido"));
  });

  it("bebida em destaque não tem selo", async () => {
    await renderLista("bebidas");
    expect(within(cardDe("Coca-cola 2L")).queryByText("Mais pedido")).not.toBeInTheDocument();
  });
});

describe("Página Lista — card", () => {
  it("preço 'R$ X o cento' só para cento; os demais, só o preço", async () => {
    await renderLista("doces");
    expect(screen.getByText("R$ 100,00 o cento")).toBeInTheDocument();
    expect(screen.getByText("R$ 2,50")).toBeInTheDocument();
  });

  it("card sem foto usa o fundo da marca, com texto alternativo; com foto, a foto com texto alternativo", async () => {
    await renderLista();
    const fallback = screen.getByRole("img", { name: "Kit Festa: foto ainda não disponível" });
    expect(fallback).toHaveClass("home-product-fallback");
    expect(screen.getByRole("img", { name: "Foto de Bolo de Chocolate" })).toHaveAttribute("src", COM_FOTO);
  });

  it("card e botão levam à interna pelo id; nada vai para o carrinho", async () => {
    await renderLista("salgados");
    const empada = CATALOGO.find((p) => p.nome === "Empada")!;
    const card = screen.getByRole("heading", { level: 3, name: "Empada" }).closest("article")!;
    const links = within(card).getAllByRole("link");
    expect(links.length).toBeGreaterThanOrEqual(2);
    for (const link of links) expect(link).toHaveAttribute("href", `/produtos/${empada.id}`);
    expect(document.querySelector('a[href="/carrinho"]')).toBeNull();
  });
});
