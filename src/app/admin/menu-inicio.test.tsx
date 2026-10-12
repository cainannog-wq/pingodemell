// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

let caminho = "/admin";
vi.mock("next/navigation", () => ({ usePathname: () => caminho }));
vi.mock("@/lib/supabase/dal", () => ({ requireAuth: async () => ({ email: "equipe@exemplo.com" }), getAuthenticatedUser: vi.fn() }));
vi.mock("./actions", () => ({ logout: vi.fn() }));
vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />,
}));

describe("menu e logo do admin", () => {
  it("o menu tem 'Visitas do site' para /admin, ativo na primeira tela, e as rotas antigas continuam no menu", async () => {
    caminho = "/admin";
    const { default: Layout } = await import("./layout");
    render(await Layout({ children: <div /> }));
    const item = screen.getByRole("link", { name: /Visitas do site/ });
    expect(item.getAttribute("href")).toBe("/admin");
    expect(item.style.fontWeight).toBe("700"); // ativo
    for (const [nome, href] of [
      ["Produtos", "/admin/produtos"],
      ["Recheios", "/admin/recheios"],
      ["Histórico de pedidos", "/admin/pedidos"],
      ["Dias sem produção", "/admin/dias-off"],
    ]) {
      const l = screen.getAllByRole("link", { name: new RegExp(nome) }).find((a) => a.getAttribute("href") === href);
      expect(l, nome).toBeTruthy();
      expect(l!.style.fontWeight, nome).toBe("400"); // inativo em /admin
    }
  });

  it("os logos (lateral e topo do celular) são links para /admin", async () => {
    caminho = "/admin/produtos";
    const { default: Layout } = await import("./layout");
    const { container } = render(await Layout({ children: <div /> }));
    const logos = Array.from(container.querySelectorAll("a")).filter((a) => a.querySelector('[aria-label="Pingo de Mell"]'));
    expect(logos).toHaveLength(2);
    for (const a of logos) expect(a.getAttribute("href")).toBe("/admin");
    // "Visitas do site" não fica ativo fora de /admin
    expect(screen.getByRole("link", { name: /Visitas do site/ }).style.fontWeight).toBe("400");
  });

  it("rótulo do topo: 'Início · Visitas do site' em /admin; as outras telas mantêm o seu", async () => {
    const { Crumb } = await import("./crumb");
    const casos: Array<[string, string]> = [
      ["/admin", "Início · Visitas do site"],
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
