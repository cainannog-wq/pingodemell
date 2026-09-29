// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Formulário de produto com os tipos Bolo e Bento Cake: campos que não valem
// somem, categoria acompanha o tipo. Nada é gravado: a Server Action é
// simulada.

const PRODUTO = "197d31af-803d-4af9-b6d4-66fd013dff4d";

vi.mock("./actions", () => ({
  prepararEnvioFotos: vi.fn(async () => ({ envios: [] })),
  descartarEnviosFotos: vi.fn(async () => undefined),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ storage: { from: () => ({ uploadToSignedUrl: vi.fn() }) } }),
}));
vi.mock("@/lib/galeria/reduzir", () => ({ reduzirFoto: vi.fn() }));

const { ProdutoForm } = await import("./produto-form");

const acao = vi.fn<(...args: unknown[]) => Promise<object>>(async () => ({}));

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => "blob:previa");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => cleanup());

const BOLO_SALVO = {
  id: PRODUTO,
  slug: "bolo-de-chocolate",
  nome: "Bolo de Chocolate",
  preco: 45,
  descricao: null,
  pedido_minimo: 1,
  Categoria: "Bolos",
  prazo_producao_dias: 2,
  step_quantidade: "livre",
  destaque: false,
  ativo: true,
  tipo: "bolo",
  unidade_venda: "kg",
  image_url: null,
} as never;

const categoria = () => screen.getByLabelText(/Categoria/) as HTMLSelectElement;
const tipo = () => screen.getByLabelText(/Tipo de produto/) as HTMLSelectElement;
const campo = (rotulo: RegExp) => screen.queryByLabelText(rotulo);
const escolherTipo = (valor: string) => fireEvent.change(tipo(), { target: { value: valor } });
const enviado = () => new FormData(document.querySelector("form") as HTMLFormElement);

function renderNovo() {
  return render(<ProdutoForm action={acao} produtoId={PRODUTO} submitLabel="Cadastrar produto" />);
}

describe("Formulário de produto — tipo Bolo", () => {
  it("oferece os tipos Bolo e Bento Cake", () => {
    renderNovo();
    expect(Array.from(tipo().options).map((o) => o.value)).toEqual(["normal", "cento", "bolo", "bento_cake"]);
  });

  it("produto normal: preço, quantidade mínima, step e unidade aparecem", () => {
    renderNovo();
    for (const rotulo of [/^Preço/, /Quantidade mínima/, /Step de quantidade/, /Unidade de venda/, /Prazo de produção/]) {
      expect(campo(rotulo)).toBeInTheDocument();
    }
  });

  it("escolher Bolo trava a categoria em Bolos e tira preço, mínimo, step e unidade (o prazo fica)", () => {
    renderNovo();
    escolherTipo("bolo");
    expect(categoria()).toBeDisabled();
    expect(categoria().value).toBe("Bolos");
    for (const rotulo of [/^Preço/, /Quantidade mínima/, /Step de quantidade/, /Unidade de venda/]) {
      expect(campo(rotulo)).toBeNull();
    }
    expect(campo(/Prazo de produção/)).toBeInTheDocument();
    expect(screen.getByText(/O preço de um Bolo vem do catálogo de recheios/)).toBeInTheDocument();
  });

  it("o envio de um Bolo leva a categoria (campo escondido) e não leva os campos que não valem", () => {
    renderNovo();
    escolherTipo("bolo");
    const dados = enviado();
    expect(dados.get("categoria")).toBe("Bolos");
    expect(dados.get("tipo")).toBe("bolo");
    for (const nome of ["preco", "pedido_minimo", "step_quantidade", "unidade_venda"]) {
      expect(dados.has(nome)).toBe(false);
    }
  });

  it("voltar para Normal devolve os campos e destrava a categoria", () => {
    renderNovo();
    escolherTipo("bolo");
    escolherTipo("normal");
    expect(categoria()).not.toBeDisabled();
    expect(campo(/^Preço/)).toBeInTheDocument();
    expect(campo(/Unidade de venda/)).toBeInTheDocument();
  });

  it("edição de um Bolo abre sem os campos que não valem, com a categoria Bolos travada", () => {
    render(<ProdutoForm action={acao} produto={BOLO_SALVO} produtoId={PRODUTO} submitLabel="Salvar alterações" />);
    expect(tipo().value).toBe("bolo");
    expect(categoria().value).toBe("Bolos");
    expect(categoria()).toBeDisabled();
    expect(campo(/^Preço/)).toBeNull();
  });

  it("Smash Cake (normal em Bolos): todos os campos, categoria livre", () => {
    renderNovo();
    fireEvent.change(categoria(), { target: { value: "Bolos" } });
    expect(tipo().value).toBe("normal");
    expect(categoria()).not.toBeDisabled();
    expect(campo(/^Preço/)).toBeInTheDocument();
    expect(campo(/Unidade de venda/)).toBeInTheDocument();
  });
});

describe("Formulário de produto — tipo Bento Cake", () => {
  it("escolher Bento Cake trava a categoria; preço e mínimo ficam; step e unidade somem", () => {
    renderNovo();
    escolherTipo("bento_cake");
    expect(categoria().value).toBe("Bento Cake");
    expect(categoria()).toBeDisabled();
    expect(campo(/^Preço/)).toBeInTheDocument();
    expect(campo(/Quantidade mínima/)).toBeInTheDocument();
    expect(campo(/Step de quantidade/)).toBeNull();
    expect(campo(/Unidade de venda/)).toBeNull();
    const dados = enviado();
    expect(dados.get("categoria")).toBe("Bento Cake");
    expect(dados.get("tipo")).toBe("bento_cake");
  });

  it("escolher a categoria Bento Cake põe o tipo em Bento Cake", () => {
    renderNovo();
    fireEvent.change(categoria(), { target: { value: "Bento Cake" } });
    expect(tipo().value).toBe("bento_cake");
    expect(categoria()).toBeDisabled();
  });

  it("sair do tipo Bento Cake solta a categoria e pede para escolher de novo", () => {
    renderNovo();
    escolherTipo("bento_cake");
    escolherTipo("normal");
    expect(categoria()).not.toBeDisabled();
    expect(categoria().value).toBe("");
  });
});
