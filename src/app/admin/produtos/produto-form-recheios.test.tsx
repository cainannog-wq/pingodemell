// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Formulário de produto com recheios personalizados: o interruptor só existe
// para Bolos de tipo normal e Bento Cake; ligado, a lista é editável e o
// Salvar fica bloqueado com lista vazia, em branco ou repetida. Nada é
// gravado: a Server Action é simulada.

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
beforeEach(() => acao.mockClear());
afterEach(() => cleanup());

function salvo(parcial: Record<string, unknown>) {
  return {
    id: PRODUTO,
    slug: "produto",
    nome: "Produto",
    preco: 108,
    descricao: null,
    pedido_minimo: 1,
    Categoria: "Bolos",
    prazo_producao_dias: 3,
    step_quantidade: "livre",
    destaque: false,
    ativo: true,
    tipo: "normal",
    unidade_venda: "o kg",
    image_url: null,
    ...parcial,
  } as never;
}

const interruptor = () => screen.queryByRole("checkbox", { name: "Recheios personalizados" });
const categoria = () => screen.getByLabelText(/Categoria/) as HTMLSelectElement;
const tipo = () => screen.getByLabelText(/Tipo de produto/) as HTMLSelectElement;
const campos = () => screen.queryAllByLabelText(/^Recheio \d+$/) as HTMLInputElement[];
const enviado = () => new FormData(document.querySelector("form") as HTMLFormElement);
const salvar = () => fireEvent.submit(document.querySelector("form") as HTMLFormElement);
const alertas = () => screen.getAllByRole("alert").map((a) => a.textContent ?? "");

function renderEdicao(produto: Record<string, unknown>, recheios: { id: string; nome: string }[] = []) {
  return render(
    <ProdutoForm action={acao} produto={salvo(produto)} produtoId={PRODUTO} submitLabel="Salvar alterações" recheiosIniciais={recheios} />
  );
}

describe("Interruptor 'Recheios personalizados' — onde aparece", () => {
  it("aparece em Bolos de tipo normal e no Bento Cake", () => {
    renderEdicao({ Categoria: "Bolos", tipo: "normal" });
    expect(interruptor()).toBeInTheDocument();
    cleanup();
    renderEdicao({ Categoria: "Bento Cake", tipo: "bento_cake" });
    expect(interruptor()).toBeInTheDocument();
  });

  it("não aparece no Bolo tradicional (tipo bolo)", () => {
    renderEdicao({ Categoria: "Bolos", tipo: "bolo" });
    expect(interruptor()).toBeNull();
  });

  it.each(["Doces", "Salgados", "Bebidas", "Kit Festa", "Adicionais"])("não aparece na categoria %s", (nome) => {
    renderEdicao({ Categoria: nome, tipo: "normal" });
    expect(interruptor()).toBeNull();
  });

  it("acompanha a categoria e o tipo escolhidos na própria tela", () => {
    render(<ProdutoForm action={acao} produtoId={PRODUTO} submitLabel="Cadastrar produto" />);
    expect(interruptor()).toBeNull();
    fireEvent.change(categoria(), { target: { value: "Bolos" } });
    expect(interruptor()).toBeInTheDocument();
    fireEvent.change(tipo(), { target: { value: "bolo" } });
    expect(interruptor()).toBeNull();
    fireEvent.change(tipo(), { target: { value: "bento_cake" } });
    expect(interruptor()).toBeInTheDocument();
    fireEvent.change(tipo(), { target: { value: "normal" } });
    fireEvent.change(categoria(), { target: { value: "Doces" } });
    expect(interruptor()).toBeNull();
  });
});

describe("Lista de recheios do produto", () => {
  it("produto com lista salva abre com o interruptor ligado e os recheios na ordem", () => {
    renderEdicao({ Categoria: "Bolos", tipo: "normal" }, [
      { id: "11111111-1111-4111-8111-111111111111", nome: "Dois amores" },
      { id: "22222222-2222-4222-8222-222222222222", nome: "Ouro branco" },
    ]);
    expect(interruptor()).toBeChecked();
    expect(campos().map((c) => c.value)).toEqual(["Dois amores", "Ouro branco"]);
  });

  it("ligar abre o primeiro campo; adicionar, reordenar (alça) e remover mexem na lista", () => {
    renderEdicao({ Categoria: "Bolos", tipo: "normal" });
    expect(interruptor()).not.toBeChecked();
    expect(campos()).toHaveLength(0);
    fireEvent.click(interruptor()!);
    expect(campos()).toHaveLength(1);
    fireEvent.change(campos()[0], { target: { value: "A" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar recheio" }));
    fireEvent.change(campos()[1], { target: { value: "B" } });
    fireEvent.keyDown(screen.getByRole("button", { name: /Reordenar recheio 2/ }), { key: "ArrowUp" });
    expect(campos().map((c) => c.value)).toEqual(["B", "A"]);
    fireEvent.keyDown(screen.getByRole("button", { name: /Reordenar recheio 1/ }), { key: "ArrowDown" });
    expect(campos().map((c) => c.value)).toEqual(["A", "B"]);
    fireEvent.click(screen.getByRole("button", { name: "Remover o recheio 1" }));
    expect(campos().map((c) => c.value)).toEqual(["B"]);
    // Com um recheio só, a alça fica desligada (nada a ordenar).
    expect(screen.getByRole("button", { name: /Reordenar recheio 1/ })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Subir o recheio|Descer o recheio/ })).toBeNull();
  });
});

describe("Salvar bloqueado", () => {
  it("interruptor ligado com a lista vazia: bloqueia, com a mensagem junto ao campo", () => {
    renderEdicao({ Categoria: "Bolos", tipo: "normal" });
    fireEvent.click(interruptor()!);
    fireEvent.click(screen.getByRole("button", { name: "Remover o recheio 1" }));
    salvar();
    expect(alertas().some((t) => /pelo menos um recheio/.test(t))).toBe(true);
    expect(acao).not.toHaveBeenCalled();
  });

  it("campo em branco bloqueia", () => {
    renderEdicao({ Categoria: "Bolos", tipo: "normal" });
    fireEvent.click(interruptor()!);
    salvar();
    expect(alertas().some((t) => /em branco/.test(t))).toBe(true);
    expect(acao).not.toHaveBeenCalled();
  });

  it("recheio repetido (sem acento nem maiúscula) bloqueia", () => {
    renderEdicao({ Categoria: "Bolos", tipo: "normal" });
    fireEvent.click(interruptor()!);
    fireEvent.change(campos()[0], { target: { value: "Prestígio" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar recheio" }));
    fireEvent.change(campos()[1], { target: { value: "prestigio" } });
    salvar();
    expect(alertas().some((t) => /repetido/.test(t))).toBe(true);
    expect(acao).not.toHaveBeenCalled();
  });

  it("lista boa salva e vai no envio com o interruptor e os ids de quem já existia", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    renderEdicao({ Categoria: "Bolos", tipo: "normal" }, [{ id, nome: "Dois amores" }]);
    fireEvent.click(screen.getByRole("button", { name: "Adicionar recheio" }));
    fireEvent.change(campos()[1], { target: { value: "Ouro branco" } });
    expect(JSON.parse(String(enviado().get("recheios_produto")))).toEqual([{ id, nome: "Dois amores" }, { nome: "Ouro branco" }]);
    expect(enviado().get("recheios_ligados")).toBe("1");
    salvar();
    await waitFor(() => expect(acao).toHaveBeenCalledTimes(1));
  });

  it("interruptor desligado não bloqueia e manda a lista vazia (apaga ao salvar)", async () => {
    renderEdicao({ Categoria: "Bolos", tipo: "normal" }, [{ id: "11111111-1111-4111-8111-111111111111", nome: "Dois amores" }]);
    fireEvent.click(interruptor()!);
    expect(enviado().get("recheios_ligados")).toBe("0");
    expect(enviado().get("recheios_produto")).toBe("[]");
    salvar();
    await waitFor(() => expect(acao).toHaveBeenCalledTimes(1));
  });
});

describe("Produto que deixou de ser elegível", () => {
  it("sem interruptor e sem lista salva, nenhum campo de recheio vai no envio", () => {
    renderEdicao({ Categoria: "Doces", tipo: "normal" });
    expect(enviado().has("recheios_produto")).toBe(false);
    expect(enviado().has("recheios_ligados")).toBe(false);
  });

  it("com lista salva e categoria trocada para fora de Bolos: manda lista vazia para limpar", () => {
    renderEdicao({ Categoria: "Bolos", tipo: "normal" }, [{ id: "11111111-1111-4111-8111-111111111111", nome: "Dois amores" }]);
    fireEvent.change(categoria(), { target: { value: "Doces" } });
    expect(interruptor()).toBeNull();
    expect(enviado().get("recheios_produto")).toBe("[]");
    expect(enviado().get("recheios_ligados")).toBe("0");
  });
});
