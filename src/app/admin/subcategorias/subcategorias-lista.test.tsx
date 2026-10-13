// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Subcategoria } from "@/lib/subcategorias/types";

const acoes = vi.hoisted(() => ({
  apagarSubcategoria: vi.fn(async (...args: unknown[]): Promise<{ error?: string }> => (void args, {})),
  atualizarAtivoSubcategoria: vi.fn(async (...args: unknown[]): Promise<{ error?: string }> => (void args, {})),
  criarSubcategoria: vi.fn(async (...args: unknown[]): Promise<{ error?: string }> => (void args, {})),
  moverSubcategoria: vi.fn(async (...args: unknown[]): Promise<{ error?: string }> => (void args, {})),
  renomearSubcategoria: vi.fn(async (...args: unknown[]): Promise<{ error?: string }> => (void args, {})),
}));
vi.mock("./actions", () => acoes);

const { SubcategoriasLista } = await import("./subcategorias-lista");

const sub = (id: string, categoria: Subcategoria["categoria"], nome: string, ordem: number, ativo = true): Subcategoria => ({
  id,
  categoria,
  nome,
  slug: nome.toLowerCase(),
  ordem,
  ativo,
});

const SUBS = [
  sub("d2", "Doces", "Finos", 20),
  sub("d1", "Doces", "Gourmet", 10),
  sub("b1", "Bolos", "Tradicional", 10, false),
];

beforeEach(() => Object.values(acoes).forEach((f) => f.mockClear()));
afterEach(() => cleanup());

describe("lista de subcategorias", () => {
  it("mostra as 7 categorias, as vazias com 'Nenhuma subcategoria', e o botão de criar em cada uma", () => {
    render(<SubcategoriasLista subcategorias={SUBS} produtosPorSubcategoria={{}} />);
    const titulos = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(titulos).toEqual(["Bolos", "Bento Cake", "Doces", "Salgados", "Bebidas", "Kit Festa", "Adicionais"]);
    expect(screen.getAllByText("Nenhuma subcategoria")).toHaveLength(5);
    expect(screen.getAllByRole("button", { name: /^Adicionar em / })).toHaveLength(7);
  });

  it("ordena por ordem dentro da categoria, mostra o endereço como informação e a contagem de produtos", () => {
    const { container } = render(<SubcategoriasLista subcategorias={SUBS} produtosPorSubcategoria={{ d1: 3 }} />);
    const nomes = [...container.querySelectorAll("tbody tr .admin-table-title > div:first-child")].map((e) => e.textContent);
    expect(nomes).toEqual(["Tradicional", "Gourmet", "Finos"]);
    expect(screen.getByText("Endereço: gourmet (fixo)")).toBeInTheDocument();
    const linha = screen.getAllByText("Gourmet")[0].closest("tr") as HTMLElement;
    expect(within(linha).getByText("3")).toBeInTheDocument();
  });

  it("setas desabilitadas no primeiro (subir) e no último (descer) de cada categoria", () => {
    render(<SubcategoriasLista subcategorias={SUBS} produtosPorSubcategoria={{}} />);
    expect(screen.getByRole("button", { name: "Subir Gourmet" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Descer Gourmet" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Subir Finos" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Descer Finos" })).toBeDisabled();
    // Categoria com uma só: as duas desabilitadas.
    expect(screen.getByRole("button", { name: "Subir Tradicional" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Descer Tradicional" })).toBeDisabled();
  });

  it("descer chama a ação de mover com o id e a direção", async () => {
    render(<SubcategoriasLista subcategorias={SUBS} produtosPorSubcategoria={{}} />);
    fireEvent.click(screen.getByRole("button", { name: "Descer Gourmet" }));
    await waitFor(() => expect(acoes.moverSubcategoria).toHaveBeenCalledWith("d1", "descer"));
  });

  it("criar usa a categoria da seção e limpa o campo quando dá certo", async () => {
    render(<SubcategoriasLista subcategorias={SUBS} produtosPorSubcategoria={{}} />);
    const campo = screen.getByLabelText("Nome da nova subcategoria de Bebidas") as HTMLInputElement;
    fireEvent.change(campo, { target: { value: "Sucos" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar em Bebidas" }));
    await waitFor(() => expect(acoes.criarSubcategoria).toHaveBeenCalledWith("Bebidas", "Sucos"));
    await waitFor(() => expect(campo.value).toBe(""));
  });

  it("erro da ação aparece na tela e o campo de criar mantém o texto", async () => {
    acoes.criarSubcategoria.mockResolvedValueOnce({ error: "Já existe uma subcategoria com esse nome nesta categoria." });
    render(<SubcategoriasLista subcategorias={SUBS} produtosPorSubcategoria={{}} />);
    const campo = screen.getByLabelText("Nome da nova subcategoria de Doces") as HTMLInputElement;
    fireEvent.change(campo, { target: { value: "Gourmet" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar em Doces" }));
    expect((await screen.findAllByRole("alert"))[0]).toHaveTextContent("Já existe uma subcategoria com esse nome nesta categoria.");
    expect(campo.value).toBe("Gourmet");
  });

  it("renomear: abre o campo com o nome atual e chama a ação", async () => {
    render(<SubcategoriasLista subcategorias={SUBS} produtosPorSubcategoria={{}} />);
    const linha = screen.getAllByText("Finos")[0].closest("tr") as HTMLElement;
    fireEvent.click(within(linha).getByRole("button", { name: "Renomear Finos" }));
    const campo = screen.getAllByLabelText("Novo nome da subcategoria Finos")[0] as HTMLInputElement;
    expect(campo.value).toBe("Finos");
    fireEvent.change(campo, { target: { value: "Finíssimos" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Salvar nome" })[0]);
    await waitFor(() => expect(acoes.renomearSubcategoria).toHaveBeenCalledWith("d2", "Finíssimos"));
  });

  it("apagar pede confirmação; só 'Sim, apagar' chama a ação; recusa do servidor aparece na tela", async () => {
    acoes.apagarSubcategoria.mockResolvedValueOnce({ error: "3 produtos usam esta subcategoria; desative em vez de apagar." });
    render(<SubcategoriasLista subcategorias={SUBS} produtosPorSubcategoria={{ d1: 3 }} />);
    const linha = screen.getAllByText("Gourmet")[0].closest("tr") as HTMLElement;
    fireEvent.click(within(linha).getByRole("button", { name: "Apagar Gourmet" }));
    expect(acoes.apagarSubcategoria).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole("button", { name: "Sim, apagar" })[0]);
    await waitFor(() => expect(acoes.apagarSubcategoria).toHaveBeenCalledWith("d1"));
    // A recusa aparece na própria linha (junto da confirmação), não num aviso no topo.
    await waitFor(() => expect(within(linha).getByRole("alert")).toHaveTextContent("3 produtos usam esta subcategoria; desative em vez de apagar."));
    expect(within(linha).getByRole("button", { name: "Sim, apagar" })).toBeInTheDocument();
  });

  it("o interruptor de status chama a ação e volta ao valor anterior se falhar", async () => {
    acoes.atualizarAtivoSubcategoria.mockResolvedValueOnce({ error: "Não foi possível salvar agora. Tente de novo em instantes." });
    render(<SubcategoriasLista subcategorias={SUBS} produtosPorSubcategoria={{}} />);
    const interruptor = screen.getAllByRole("checkbox", { name: "Subcategoria Gourmet ativa" })[0];
    expect(interruptor).toBeChecked();
    fireEvent.click(interruptor);
    await waitFor(() => expect(acoes.atualizarAtivoSubcategoria).toHaveBeenCalledWith("d1", false));
    await waitFor(() => expect(screen.getAllByRole("checkbox", { name: "Subcategoria Gourmet ativa" })[0]).toBeChecked());
  });

  it("os botões da tabela são só ícone (com nome acessível) e o celular tem o menu de 3 pontinhos", async () => {
    render(<SubcategoriasLista subcategorias={SUBS} produtosPorSubcategoria={{}} />);
    const renomear = screen.getByRole("button", { name: "Renomear Finos" });
    expect(renomear.textContent?.trim()).toBe("edit");
    const menu = screen.getByRole("button", { name: "Ações de Finos" });
    expect(screen.queryByRole("menuitem")).toBeNull();
    fireEvent.click(menu);
    expect(screen.getAllByRole("menuitem").map((e) => e.textContent?.replace(/^[a-z_]+/, ""))).toEqual(["Subir", "Descer", "Renomear", "Apagar"]);
    fireEvent.click(screen.getByRole("menuitem", { name: /Descer/ }));
    expect(acoes.moverSubcategoria).not.toHaveBeenCalled(); // Finos é a última: Descer desabilitado
    fireEvent.click(screen.getByRole("menuitem", { name: /Subir/ }));
    await waitFor(() => expect(acoes.moverSubcategoria).toHaveBeenCalledWith("d2", "subir"));
  });
});
