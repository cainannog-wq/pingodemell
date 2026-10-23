// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

let caminho = "/admin/produtos";
const redirect = vi.fn((d: string) => {
  throw new Error(`REDIRECT:${d}`);
});
vi.mock("next/navigation", () => ({ usePathname: () => caminho, redirect: (d: string) => redirect(d) }));
vi.mock("@/lib/supabase/dal", () => ({ requireAuth: async () => ({ email: "equipe@exemplo.com" }), getAuthenticatedUser: vi.fn() }));
vi.mock("./actions", () => ({ logout: vi.fn() }));
vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />,
}));

describe("primeira tela e menu do admin", () => {
  it("/admin continua redirecionando para Produtos (o relatório demora, não é a primeira tela)", async () => {
    const { default: Pagina } = await import("./page");
    expect(() => Pagina()).toThrow("REDIRECT:/admin/produtos");
  });

  it("'Visitas do site' é o último item do menu, sob 'Site', e só fica ativo em /admin/visitas", async () => {
    const { default: Layout } = await import("./layout");
    caminho = "/admin/visitas";
    const { container, unmount } = render(await Layout({ children: <div /> }));
    const links = Array.from(container.querySelectorAll("aside nav a"));
    const ultimo = links[links.length - 1];
    expect(ultimo.textContent).toContain("Visitas do site");
    expect(ultimo.getAttribute("href")).toBe("/admin/visitas");
    expect((ultimo as HTMLElement).style.fontWeight).toBe("700");
    expect(container.querySelector("aside nav")!.textContent).toMatch(/Site\s*pie_chartVisitas do site$/);
    // Produtos fica inativo em /admin/visitas
    const produtos = links.find((a) => a.getAttribute("href") === "/admin/produtos") as HTMLElement;
    expect(produtos.style.fontWeight).toBe("400");
    unmount();

    caminho = "/admin/produtos";
    render(await Layout({ children: <div /> }));
    expect((screen.getByRole("link", { name: /Visitas do site/ }) as HTMLElement).style.fontWeight).toBe("400");
  });

  it("as rotas antigas continuam no menu e os logos (lateral e topo do celular) levam a Produtos", async () => {
    caminho = "/admin/produtos";
    const { default: Layout } = await import("./layout");
    const { container } = render(await Layout({ children: <div /> }));
    for (const [nome, href] of [
      ["Produtos", "/admin/produtos"],
      ["Recheios", "/admin/recheios"],
      ["Histórico de pedidos", "/admin/pedidos"],
      ["Dias sem produção", "/admin/dias-off"],
    ]) {
      const l = screen.getAllByRole("link", { name: new RegExp(nome) }).find((a) => a.getAttribute("href") === href);
      expect(l, nome).toBeTruthy();
    }
    const logos = Array.from(container.querySelectorAll("a")).filter((a) => a.querySelector('[aria-label="Pingo de Mell"]'));
    expect(logos).toHaveLength(2);
    for (const a of logos) expect(a.getAttribute("href")).toBe("/admin/produtos");
  });

  it("rótulo do topo", async () => {
    const { Crumb } = await import("./crumb");
    const casos: Array<[string, string]> = [
      ["/admin/visitas", "Site · Visitas do site"],
      ["/admin/kit-listas", "Cardápio · Kit Festa"],
      ["/admin/produtos", "Cardápio · Produtos"],
      ["/admin/produtos/novo", "Cardápio · Novo produto"],
      ["/admin/pedidos", "Pedidos · Histórico"],
      ["/admin/dias-off", "Calendário · Dias sem produção"],
      ["/admin/recheios", "Cardápio · Recheios"],
    ];
    for (const [rota, texto] of casos) {
      caminho = rota;
      const { unmount } = render(<Crumb />);
      expect(screen.getByText(texto), rota).toBeTruthy();
      unmount();
    }
  });
});
