// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Formulário de produto com a foto de capa: a foto é reduzida ao ser
// escolhida, nada vai para o servidor nem para o storage até o Salvar, e o
// que sobe é a foto reduzida — nunca o arquivo original, e nunca pelo
// formulário da Server Action (limite de 1 MB).

const PRODUTO = "197d31af-803d-4af9-b6d4-66fd013dff4d";
const CAPA = "cccccccc-0000-4000-8000-000000000000";

const preparar = vi.fn(async (_id: string, extensoes: string[], extensaoCapa?: string) => ({
  envios: extensoes.map((ext, i) => ({
    novo: `0000000${i}-0000-4000-8000-000000000000`,
    ext,
    caminho: `galeria/${PRODUTO}/0000000${i}-0000-4000-8000-000000000000.${ext}`,
    token: `t${i}`,
  })),
  ...(extensaoCapa ? { capa: { novo: CAPA, ext: extensaoCapa, caminho: `capa/${PRODUTO}/${CAPA}.${extensaoCapa}`, token: "tc" } } : {}),
}));
const descartar = vi.fn(async () => undefined);
const uploadToSignedUrl = vi.fn<(...args: unknown[]) => Promise<{ error: { message: string } | null }>>(async () => ({ error: null }));
const reduzirFoto = vi.fn(async (arquivo: File) =>
  arquivo.name.startsWith("ruim")
    ? { ok: false as const, erro: `Não foi possível abrir a foto "${arquivo.name}" neste navegador.` }
    : {
        ok: true as const,
        foto: { blob: new Blob([`reduzida:${arquivo.name}`], { type: "image/webp" }), ext: "webp" as const, largura: 2000, altura: 1500 },
      }
);

vi.mock("./actions", () => ({
  prepararEnvioFotos: (id: string, ext: string[], capa?: string) => (capa ? preparar(id, ext, capa) : preparar(id, ext)),
  descartarEnviosFotos: () => descartar(),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ storage: { from: () => ({ uploadToSignedUrl }) } }),
}));
vi.mock("@/lib/galeria/reduzir", () => ({ reduzirFoto: (arquivo: File) => reduzirFoto(arquivo) }));

const { ProdutoForm } = await import("./produto-form");

const acao = vi.fn<(...args: unknown[]) => Promise<object>>(async () => ({}));

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => "blob:previa");
  URL.revokeObjectURL = vi.fn();
});
beforeEach(() => {
  preparar.mockClear();
  descartar.mockClear();
  uploadToSignedUrl.mockClear();
  reduzirFoto.mockClear();
  acao.mockClear();
});
afterEach(() => cleanup());

const PRODUTO_SALVO = {
  id: PRODUTO,
  nome: "Brigadeiro Gourmet",
  preco: 5,
  descricao: null,
  pedido_minimo: 25,
  Categoria: "Doces",
  prazo_producao_dias: 1,
  step_quantidade: "livre",
  destaque: true,
  ativo: true,
  tipo: "normal",
  image_url: "https://proj.supabase.co/storage/v1/object/public/Pingo%20de%20Mell/1789162576907-de960btf3eq.jpeg",
} as never;

async function escolherCapa(nome: string) {
  // Arquivo "de celular" com metadados de GPS: nada disso pode subir.
  const original = new File(["\xff\xd8\xff\xe1Exif GPSLatitude -25.63"], nome, { type: "image/jpeg" });
  await act(async () => {
    fireEvent.change(screen.getByTestId("capa-input"), { target: { files: [original] } });
  });
  return original;
}

async function salvar(rotulo: string) {
  await act(async () => {
    fireEvent.submit(screen.getByRole("button", { name: rotulo }).closest("form")!);
  });
}

describe("ProdutoForm — foto de capa", () => {
  it("escolher a capa só reduz no navegador: nada vai para o servidor nem para o storage; sair sem salvar não deixa nada", async () => {
    const { unmount } = render(<ProdutoForm action={acao} produto={PRODUTO_SALVO} produtoId={PRODUTO} submitLabel="Salvar alterações" />);
    await escolherCapa("IMG_1234.jpg");
    expect(reduzirFoto).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Ainda não salva")).toBeVisible();
    expect(screen.getByAltText("Prévia da nova foto de capa")).toBeVisible();
    unmount();
    expect(preparar).not.toHaveBeenCalled();
    expect(uploadToSignedUrl).not.toHaveBeenCalled();
    expect(acao).not.toHaveBeenCalled();
  });

  it("no Salvar: sobe a foto reduzida no caminho autorizado e manda só id + extensão; nenhum arquivo vai no formulário", async () => {
    render(<ProdutoForm action={acao} produto={PRODUTO_SALVO} produtoId={PRODUTO} submitLabel="Salvar alterações" />);
    const original = await escolherCapa("IMG_1234.jpg");
    await salvar("Salvar alterações");

    await waitFor(() => expect(acao).toHaveBeenCalledTimes(1));
    expect(preparar).toHaveBeenCalledWith(PRODUTO, [], "webp");
    expect(uploadToSignedUrl).toHaveBeenCalledTimes(1);
    const [caminho, token, blob, opcoes] = uploadToSignedUrl.mock.calls[0] as [string, string, Blob, unknown];
    expect(caminho).toBe(`capa/${PRODUTO}/${CAPA}.webp`);
    expect(token).toBe("tc");
    expect(blob).not.toBe(original);
    expect(await blob.text()).toBe("reduzida:IMG_1234.jpg");
    expect(await blob.text()).not.toContain("GPS");
    expect(opcoes).toEqual({ contentType: "image/webp", upsert: false });

    const formData = acao.mock.calls[0][1] as FormData;
    expect(JSON.parse(formData.get("capa") as string)).toEqual({ novo: CAPA, ext: "webp" });
    for (const [, valor] of formData.entries()) expect(valor).not.toBeInstanceOf(File);
    expect(formData.has("foto")).toBe(false);
  });

  it("sem capa nova: o formulário não manda o campo capa", async () => {
    render(<ProdutoForm action={acao} produto={PRODUTO_SALVO} produtoId={PRODUTO} submitLabel="Salvar alterações" />);
    await salvar("Salvar alterações");
    await waitFor(() => expect(acao).toHaveBeenCalledTimes(1));
    expect(preparar).not.toHaveBeenCalled();
    expect((acao.mock.calls[0][1] as FormData).has("capa")).toBe(false);
  });

  it("foto recusada na redução: mensagem clara e a capa atual continua (Salvar não troca a capa)", async () => {
    render(<ProdutoForm action={acao} produto={PRODUTO_SALVO} produtoId={PRODUTO} submitLabel="Salvar alterações" />);
    await escolherCapa("ruim.heic");
    expect(await screen.findByText('Não foi possível abrir a foto "ruim.heic" neste navegador.')).toBeVisible();
    expect(screen.queryByText("Ainda não salva")).toBeNull();
    await salvar("Salvar alterações");
    await waitFor(() => expect(acao).toHaveBeenCalledTimes(1));
    expect((acao.mock.calls[0][1] as FormData).has("capa")).toBe(false);
  });

  it("envio da capa falhando: mostra o erro, pede a limpeza e não chama a Server Action; a foto continua na tela", async () => {
    uploadToSignedUrl.mockResolvedValueOnce({ error: { message: "rede" } });
    render(<ProdutoForm action={acao} produto={PRODUTO_SALVO} produtoId={PRODUTO} submitLabel="Salvar alterações" />);
    await escolherCapa("IMG_1234.jpg");
    await salvar("Salvar alterações");
    expect(await screen.findByText("Não foi possível enviar a foto de capa. Nada foi salvo; tente de novo.")).toBeVisible();
    expect(descartar).toHaveBeenCalled();
    expect(acao).not.toHaveBeenCalled();
    expect(screen.getByText("Ainda não salva")).toBeVisible();
  });

  it("'Manter a capa atual' desfaz a escolha antes de salvar", async () => {
    render(<ProdutoForm action={acao} produto={PRODUTO_SALVO} produtoId={PRODUTO} submitLabel="Salvar alterações" />);
    await escolherCapa("IMG_1234.jpg");
    fireEvent.click(screen.getByRole("button", { name: "Manter a capa atual" }));
    expect(screen.queryByText("Ainda não salva")).toBeNull();
    await salvar("Salvar alterações");
    await waitFor(() => expect(acao).toHaveBeenCalledTimes(1));
    expect((acao.mock.calls[0][1] as FormData).has("capa")).toBe(false);
  });
});
