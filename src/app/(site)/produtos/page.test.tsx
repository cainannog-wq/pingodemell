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
  produto({ nome: "Beijinho", Categoria: "Doces", preco: 100, tipo: "cento" }),
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

const titulosDeGrupo = () =>
  screen.getAllByRole("heading", { level: 2 }).filter((h) => h.classList.contains("lista-grupo-titulo")).map((h) => h.textContent);
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

  it("'Todos': subtítulo H2 por grupo com produto, 'Outros' no fim, e filtro 'Todos' marcado", async () => {
    await renderLista();
    expect(titulosDeGrupo()).toEqual(["Bolos", "Doces", "Salgados", "Outros"]);
    expect(filtroAtual()).toHaveAttribute("href", "/produtos");
    expect(screen.queryByText("Torta Inativa")).not.toBeInTheDocument();
  });

  it("filtrada: sem subtítulo visível (H2 só para leitor de tela) e filtro da categoria marcado", async () => {
    await renderLista("doces");
    expect(titulosDeGrupo()).toEqual([]);
    const h2 = screen.getByRole("heading", { level: 2, name: "Doces" });
    expect(h2).toHaveClass("site-visually-hidden");
    expect(filtroAtual()).toHaveAttribute("href", "/produtos?categoria=doces");
    const cards = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(cards).toEqual(["Beijinho", "Morango Banhado"]);
  });

  it("categoria inválida na URL mostra 'Todos', sem erro", async () => {
    await renderLista("kits-festa");
    expect(filtroAtual()).toHaveAttribute("href", "/produtos");
    expect(titulosDeGrupo()).toEqual(["Bolos", "Doces", "Salgados", "Outros"]);
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
    await renderLista("bebidas");
    expect(screen.getByText("Ainda não temos produtos nesta categoria.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ver todos os produtos/ })).toHaveAttribute("href", "/produtos");
    expect(screen.queryAllByRole("heading", { level: 3 })).toHaveLength(0);
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
