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

vi.mock("./actions", () => ({
  deleteProduto: vi.fn(),
  updateProdutoAtivo: (...args: unknown[]) => updateProdutoAtivoMock(...args),
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
