// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProdutoVitrine } from "@/lib/vitrine/mais-pedidos";
import { MaisPedidos } from "./MaisPedidos";

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

// Dado simulado (não lê o banco).
const BASE: ProdutoVitrine = {
  id: "3f1c9a52-0000-4000-8000-000000000001",
  nome: "Bolo de Chocolate com Ninho",
  descricao: "Bolo inteiro de chocolate com recheio de ninho.",
  preco: 45,
  image_url: null,
  Categoria: "Bolos",
  tipo: "normal",
  ativo: true,
  destaque: true,
  atualizado_em: "2026-09-23T14:38:07.261Z",
};

describe("Home — seção Os mais pedidos", () => {
  afterEach(cleanup);

  it("some por inteiro quando não há produto (sem mensagem de vazio)", () => {
    const { container } = render(<MaisPedidos produtos={[]} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText("Os mais pedidos")).not.toBeInTheDocument();
  });

  it("produto sem foto mostra o fundo da marca, com texto alternativo coerente", () => {
    render(<MaisPedidos produtos={[BASE]} />);
    const fallback = screen.getByRole("img", { name: "Bolo de Chocolate com Ninho: foto ainda não disponível" });
    expect(fallback).toHaveClass("home-product-fallback");
    // Nenhuma <img> quebrada no lugar da foto.
    expect(document.querySelector("img")).toBeNull();
  });

  it("produto com foto usa a foto com texto alternativo", () => {
    render(<MaisPedidos produtos={[{ ...BASE, image_url: "https://exemplo.supabase.co/storage/v1/object/public/f.jpg" }]} />);
    expect(screen.getByRole("img", { name: "Foto de Bolo de Chocolate com Ninho" })).toBeInTheDocument();
  });

  it("card e botão levam à interna pelo id (/produtos/{id}), nunca pelo nome", () => {
    render(<MaisPedidos produtos={[BASE]} />);
    const links = screen.getAllByRole("link");
    expect(links.length).toBeGreaterThanOrEqual(2);
    for (const link of links) {
      expect(link).toHaveAttribute("href", `/produtos/${BASE.id}`);
    }
  });

  it("mostra 'o cento' só para produto do tipo cento", () => {
    render(
      <MaisPedidos
        produtos={[
          { ...BASE, id: "a", nome: "Cento de salgados sortidos", preco: 95, tipo: "cento" },
          { ...BASE, id: "b", nome: "Morango Banhado", preco: 2.5, tipo: "normal" },
        ]}
      />
    );
    // Valor e "o cento" ficam em elementos separados (a unidade pode
    // descer de linha): confere o texto completo do bloco de preço.
    const precos = [...document.querySelectorAll(".home-price")].map((p) => p.textContent?.replace(/\s+/g, " "));
    expect(precos).toEqual(["R$ 95,00 o cento", "R$ 2,50"]);
  });
});
