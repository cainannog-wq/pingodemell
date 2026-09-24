import { beforeEach, describe, expect, it, vi } from "vitest";

const eqMock = vi.fn();
const updateMock = vi.fn(() => ({ eq: eqMock }));
const fromMock = vi.fn(() => ({ update: updateMock }));

vi.mock("@/lib/supabase/dal", () => ({
  requireAuth: vi.fn().mockResolvedValue({ id: "user-1" }),
}));

// actions.ts importa as operações de storage da galeria (chave de serviço);
// aqui elas não são o assunto do teste.
vi.mock("@/lib/galeria/storage-servidor", () => ({
  verificarArquivosNovos: vi.fn(async () => null),
  limparArquivosSemLinha: vi.fn(async () => 0),
  apagarPastaDoProduto: vi.fn(async () => 0),
  criarEnviosAssinados: vi.fn(async () => []),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: fromMock,
  })),
}));

describe("updateProdutoAtivo", () => {
  beforeEach(() => {
    eqMock.mockReset();
    updateMock.mockClear();
    fromMock.mockClear();
  });

  it("persiste o novo status e não retorna erro quando o Supabase confirma", async () => {
    eqMock.mockResolvedValue({ error: null });
    const { updateProdutoAtivo } = await import("./actions");

    const result = await updateProdutoAtivo("Bolo de cenoura", false);

    expect(result.error).toBeUndefined();
    expect(fromMock).toHaveBeenCalledWith("produtos");
    expect(updateMock).toHaveBeenCalledWith({ ativo: false });
    expect(eqMock).toHaveBeenCalledWith("nome", "Bolo de cenoura");
  });

  it("retorna mensagem de erro quando o Supabase falha, sem lançar exceção", async () => {
    eqMock.mockResolvedValue({ error: { message: "falha de rede" } });
    const { updateProdutoAtivo } = await import("./actions");

    const result = await updateProdutoAtivo("Bolo de cenoura", true);

    expect(result.error).toMatch(/falha de rede/);
  });
});
