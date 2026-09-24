// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Formulário de produto com a galeria: nada vai para o servidor nem para o
// storage até o Salvar, e sair sem salvar não deixa nada para trás.

const PRODUTO = "8b4f3b06-7e38-4d9e-ad8e-3a6a4935e1a1";

const preparar = vi.fn(async (_id: string, extensoes: string[]) => ({
  envios: extensoes.map((ext, i) => ({
    novo: `0000000${i}-0000-4000-8000-000000000000`,
    ext,
    caminho: `galeria/${PRODUTO}/0000000${i}-0000-4000-8000-000000000000.${ext}`,
    token: `t${i}`,
  })),
}));
const descartar = vi.fn(async () => undefined);
const uploadToSignedUrl = vi.fn(async () => ({ error: null }));

vi.mock("./actions", () => ({
  prepararEnvioFotos: (id: string, ext: string[]) => preparar(id, ext),
  descartarEnviosFotos: () => descartar(),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ storage: { from: () => ({ uploadToSignedUrl }) } }),
}));
vi.mock("@/lib/galeria/reduzir", () => ({
  reduzirFoto: async (arquivo: File) => ({
    ok: true,
    foto: { blob: new Blob([arquivo.name], { type: "image/webp" }), ext: "webp", largura: 2000, altura: 1500 },
  }),
}));

const { ProdutoForm } = await import("./produto-form");

const acao = vi.fn(async () => ({}));

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => "blob:previa");
  URL.revokeObjectURL = vi.fn();
});
beforeEach(() => {
  preparar.mockClear();
  descartar.mockClear();
  uploadToSignedUrl.mockClear();
  acao.mockClear();
});
afterEach(() => cleanup());

async function adicionarFotos(nomes: string[]) {
  await act(async () => {
    fireEvent.change(screen.getByTestId("galeria-input"), {
      target: { files: nomes.map((n) => new File(["x"], n, { type: "image/jpeg" })) },
    });
  });
}

describe("ProdutoForm — fotos extras só no Salvar", () => {
  it("adicionar, reordenar e remover não chamam servidor nem storage; sair sem salvar não deixa nada", async () => {
    const { unmount } = render(
      <ProdutoForm
        action={acao}
        produtoId={PRODUTO}
        submitLabel="Salvar alterações"
        fotosIniciais={[{ id: "11111111-0000-4000-8000-000000000000", url: "https://storage/1.webp" }]}
      />
    );
    await adicionarFotos(["a.jpg", "b.jpg"]);
    fireEvent.click(screen.getByRole("button", { name: "Mover foto extra 3 para cima" }));
    fireEvent.click(screen.getByRole("button", { name: "Remover foto extra 1" }));
    expect(screen.getAllByText("Ainda não salva")).toHaveLength(2);

    unmount(); // sair da tela sem salvar

    expect(preparar).not.toHaveBeenCalled();
    expect(uploadToSignedUrl).not.toHaveBeenCalled();
    expect(descartar).not.toHaveBeenCalled();
    expect(acao).not.toHaveBeenCalled();
  });

  it("no Salvar: sobe as novas no caminho autorizado e manda a lista final na ordem da tela", async () => {
    render(
      <ProdutoForm
        action={acao}
        produtoId={PRODUTO}
        submitLabel="Salvar alterações"
        fotosIniciais={[{ id: "11111111-0000-4000-8000-000000000000", url: "https://storage/1.webp" }]}
      />
    );
    await adicionarFotos(["a.jpg"]);
    fireEvent.click(screen.getByRole("button", { name: "Mover foto extra 2 para cima" }));

    // Campos obrigatórios do formulário.
    fireEvent.change(screen.getByLabelText(/Nome do produto/), { target: { value: "Morango Banhado" } });
    await act(async () => {
      fireEvent.submit(screen.getByRole("button", { name: "Salvar alterações" }).closest("form")!);
    });

    await waitFor(() => expect(acao).toHaveBeenCalledTimes(1));
    expect(preparar).toHaveBeenCalledWith(PRODUTO, ["webp"]);
    expect(uploadToSignedUrl).toHaveBeenCalledWith(
      `galeria/${PRODUTO}/00000000-0000-4000-8000-000000000000.webp`,
      "t0",
      expect.any(Blob),
      { contentType: "image/webp", upsert: false }
    );
    const formData = (acao.mock.calls[0] as unknown as [unknown, FormData])[1];
    expect(JSON.parse(formData.get("galeria") as string)).toEqual([
      { novo: "00000000-0000-4000-8000-000000000000", ext: "webp" },
      { id: "11111111-0000-4000-8000-000000000000" },
    ]);
  });

  it("envio falhando no meio: mostra o erro, não chama a Server Action e pede a limpeza", async () => {
    uploadToSignedUrl.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { message: "rede" } } as never);
    render(<ProdutoForm action={acao} produtoId={PRODUTO} submitLabel="Cadastrar produto" />);
    await adicionarFotos(["a.jpg", "b.jpg"]);
    await act(async () => {
      fireEvent.submit(screen.getByRole("button", { name: "Cadastrar produto" }).closest("form")!);
    });
    expect(await screen.findByText("Não foi possível enviar a foto extra 2. Nada foi salvo; tente de novo.")).toBeVisible();
    expect(descartar).toHaveBeenCalled();
    expect(acao).not.toHaveBeenCalled();
    // As fotos continuam na tela para tentar de novo.
    expect(screen.getAllByText("Ainda não salva")).toHaveLength(2);
  });
});
