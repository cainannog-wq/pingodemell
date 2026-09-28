// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Formulário de produto: categoria obrigatória (com Kits) e unidade de
// venda. Nenhum destes testes grava nada: a Server Action é simulada.

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
  acao.mockClear();
});
afterEach(() => cleanup());

const PRODUTO_SALVO = {
  id: PRODUTO,
  slug: "brigadeiro-gourmet",
  nome: "Brigadeiro Gourmet",
  preco: 5,
  descricao: null,
  pedido_minimo: 25,
  Categoria: "Doces",
  prazo_producao_dias: 1,
  step_quantidade: "livre",
  destaque: false,
  ativo: true,
  tipo: "normal",
  unidade_venda: null,
  image_url: null,
} as never;

const categoria = () => screen.getByLabelText(/Categoria/) as HTMLSelectElement;
const unidade = () => screen.getByLabelText(/Unidade de venda/) as HTMLInputElement;

describe("Formulário de produto — categoria obrigatória", () => {
  it("cadastro novo: começa sem categoria, campo obrigatório e o Salvar é travado", () => {
    render(<ProdutoForm action={acao} produtoId={PRODUTO} submitLabel="Salvar produto" />);
    const campo = categoria();
    expect(campo).toBeRequired();
    expect(campo.value).toBe("");
    expect(campo.validity.valueMissing).toBe(true);
    expect(campo.form!.checkValidity()).toBe(false);
    // Não existe mais a opção "Sem categoria" que dava para escolher.
    expect(screen.queryByRole("option", { name: "Sem categoria" })).toBeNull();
    expect((screen.getByRole("option", { name: "Selecione a categoria" }) as HTMLOptionElement).disabled).toBe(true);
  });

  it("oferece as 5 categorias, incluindo Kits", () => {
    render(<ProdutoForm action={acao} produtoId={PRODUTO} submitLabel="Salvar produto" />);
    const opcoes = Array.from(categoria().options)
      .filter((o) => !o.disabled)
      .map((o) => o.value);
    expect(opcoes).toEqual(["Bolos", "Doces", "Salgados", "Bebidas", "Kits"]);
  });

  it("escolhendo Kits o campo fica válido", () => {
    render(<ProdutoForm action={acao} produtoId={PRODUTO} submitLabel="Salvar produto" />);
    fireEvent.change(categoria(), { target: { value: "Kits" } });
    expect(categoria().value).toBe("Kits");
    expect(categoria().validity.valid).toBe(true);
  });

  it("edição: abre com a categoria salva", () => {
    render(<ProdutoForm action={acao} produto={PRODUTO_SALVO} produtoId={PRODUTO} submitLabel="Salvar alterações" />);
    expect(categoria().value).toBe("Doces");
  });
});

describe("Formulário de produto — unidade de venda", () => {
  it("é opcional, aceita texto livre e sugere kg, unidade, cento e litro", () => {
    render(<ProdutoForm action={acao} produtoId={PRODUTO} submitLabel="Salvar produto" />);
    const campo = unidade();
    expect(campo).not.toBeRequired();
    expect(campo.name).toBe("unidade_venda");
    expect(campo.maxLength).toBe(20);
    const lista = document.getElementById(campo.getAttribute("list")!)!;
    expect(Array.from(lista.querySelectorAll("option")).map((o) => o.getAttribute("value"))).toEqual(["kg", "unidade", "cento", "litro"]);
  });

  it("edição: abre com a unidade salva; sem unidade, vazio", () => {
    const { unmount } = render(
      <ProdutoForm action={acao} produto={{ ...(PRODUTO_SALVO as object), unidade_venda: "kg" } as never} produtoId={PRODUTO} submitLabel="Salvar alterações" />
    );
    expect(unidade().value).toBe("kg");
    unmount();
    render(<ProdutoForm action={acao} produto={PRODUTO_SALVO} produtoId={PRODUTO} submitLabel="Salvar alterações" />);
    expect(unidade().value).toBe("");
  });
});
