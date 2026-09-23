// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Produto } from "@/lib/produtos/types";
import { ProdutosList } from "./produtos-list";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={props.alt as string} src={props.src as string} />;
  },
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

const updateProdutoAtivoMock = vi.fn();
const updateProdutoDestaqueMock = vi.fn();

vi.mock("./actions", () => ({
  deleteProduto: vi.fn(),
  updateProdutoAtivo: (...args: unknown[]) => updateProdutoAtivoMock(...args),
  updateProdutoDestaque: (...args: unknown[]) => updateProdutoDestaqueMock(...args),
}));

const PRODUTO: Produto = {
  nome: "Bolo de cenoura",
  preco: 45.9,
  descricao: null,
  image_url: null,
  criado_em: null,
  pedido_minimo: 1,
  Categoria: null,
  prazo_producao_dias: 2,
  step_quantidade: "livre",
  destaque: false,
  ativo: true,
  tipo: "normal",
};

// Achado #9 da auditoria de acessibilidade (22/09/2026): a mensagem de
// sucesso/erro do toggle inline precisa ser anunciada por leitor de tela
// (role="alert"/role="status"), não só aparecer visualmente. A mesma
// linha renderiza duas vezes (tabela desktop + card mobile), por isso as
// asserções usam getAllByRole em vez de findByRole (singular).
describe("AtivoToggleCell — feedback acessível", () => {
  afterEach(() => {
    cleanup();
    updateProdutoAtivoMock.mockReset();
  });

  it("anuncia erro via role=alert quando o Supabase falha, e reverte o toggle", async () => {
    updateProdutoAtivoMock.mockResolvedValue({ error: "Não foi possível atualizar o status: falha de rede" });

    render(<ProdutosList produtos={[PRODUTO]} />);

    const [toggle] = screen.getAllByRole("checkbox", { name: /desativar bolo de cenoura/i });
    fireEvent.click(toggle);

    await waitFor(() => {
      const alerts = screen.queryAllByRole("alert");
      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts[0]).toHaveTextContent("Erro ao salvar");
    });

    await waitFor(() => {
      expect((toggle as HTMLInputElement).checked).toBe(true);
    });
  });

  it("anuncia sucesso via role=status quando o Supabase confirma", async () => {
    updateProdutoAtivoMock.mockResolvedValue({});

    render(<ProdutosList produtos={[PRODUTO]} />);

    const [toggle] = screen.getAllByRole("checkbox", { name: /desativar bolo de cenoura/i });
    fireEvent.click(toggle);

    await waitFor(() => {
      const statuses = screen.queryAllByRole("status");
      expect(statuses.length).toBeGreaterThan(0);
      expect(statuses[0]).toHaveTextContent("Salvo");
    });
  });
});

// Busca por nome ignorando acento/maiúscula, combinada com o chip de
// categoria (reorganização mobile de 22/09/2026).
describe("ProdutosList — busca e chips de categoria", () => {
  afterEach(() => cleanup());

  const PAO_DE_MEL: Produto = {
    ...PRODUTO,
    nome: "Pão de Mel",
    Categoria: "Doces",
  };
  const BOLO: Produto = { ...PRODUTO, nome: "Bolo de Cenoura", Categoria: "Bolos" };
  const SEM_CATEGORIA: Produto = { ...PRODUTO, nome: "Item Avulso", Categoria: null };

  it('encontra "Pão de Mel" buscando "pao de mel" (sem acento, minúsculo)', () => {
    render(<ProdutosList produtos={[PAO_DE_MEL, BOLO]} />);

    const busca = screen.getByPlaceholderText("Buscar pelo nome do produto");
    fireEvent.change(busca, { target: { value: "pao de mel" } });

    expect(screen.getAllByText("Pão de Mel").length).toBeGreaterThan(0);
    expect(screen.queryByText("Bolo de Cenoura")).not.toBeInTheDocument();
  });

  it("combina busca com o chip de categoria selecionado", () => {
    render(<ProdutosList produtos={[PAO_DE_MEL, BOLO]} />);

    fireEvent.click(screen.getByRole("button", { name: "Bolos" }));

    const busca = screen.getByPlaceholderText("Buscar pelo nome do produto");
    fireEvent.change(busca, { target: { value: "pao de mel" } });

    // "Pão de Mel" é Doces, não Bolos: some da lista mesmo batendo na busca.
    expect(screen.queryByText("Pão de Mel")).not.toBeInTheDocument();

    fireEvent.change(busca, { target: { value: "" } });
    expect(screen.getAllByText("Bolo de Cenoura").length).toBeGreaterThan(0);
    expect(screen.queryByText("Pão de Mel")).not.toBeInTheDocument();
  });

  it('chip "Sem categoria" mostra só produtos com Categoria nula', () => {
    render(<ProdutosList produtos={[PAO_DE_MEL, SEM_CATEGORIA]} />);

    fireEvent.click(screen.getByRole("button", { name: "Sem categoria" }));

    expect(screen.getAllByText("Item Avulso").length).toBeGreaterThan(0);
    expect(screen.queryByText("Pão de Mel")).not.toBeInTheDocument();
  });
});
