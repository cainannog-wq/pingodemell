// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

const { Categorias } = await import("./Categorias");

afterEach(cleanup);

const quadrados = () =>
  within(screen.getByRole("region", { name: "O que você vai encontrar" }))
    .getAllByRole("listitem")
    .map((li) => within(li).getByRole("link"));

describe("Home — bloco de categorias", () => {
  it("mostra 5 quadrados, na ordem do CMS, cada um levando ao filtro da Lista", () => {
    render(<Categorias />);
    const links = quadrados();
    expect(links).toHaveLength(5);
    expect(links.map((a) => a.querySelector(".home-cat-label")?.textContent)).toEqual(["Bolos", "Doces", "Salgados", "Bebidas", "Kits"]);
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/produtos?categoria=bolos",
      "/produtos?categoria=doces",
      "/produtos?categoria=salgados",
      "/produtos?categoria=bebidas",
      "/produtos?categoria=kits",
    ]);
  });

  it("Kits fica sem foto, com o fundo da marca, como Bebidas", () => {
    render(<Categorias />);
    const [, , , bebidas, kits] = quadrados();
    expect(within(bebidas).queryByRole("img")).toBeNull();
    expect(within(kits).queryByRole("img")).toBeNull();
    expect(kits.querySelector(".site-hive")).not.toBeNull();
  });

  // Layout em si depende de medida, que o jsdom não calcula: garante o CSS.
  it("CSS: 5 colunas no desktop; no celular, 2 colunas e o quinto na largura inteira", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync("src/components/site/site.css", "utf8").replace(/\r/g, "");
    expect(css).toMatch(/\.home-cats \{\n  display: grid;\n  grid-template-columns: repeat\(5, 1fr\);/);
    const celular = css.slice(css.indexOf("@media (max-width: 767px) {\n  .home-cats {"));
    expect(celular).toMatch(/^@media \(max-width: 767px\) \{\n  \.home-cats \{\n    grid-template-columns: 1fr 1fr;/);
    expect(celular).toMatch(/\.home-cats > li:last-child:nth-child\(odd\) \{\n    grid-column: 1 \/ -1;/);
  });
});
