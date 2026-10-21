// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { parseProdutoForm } from "@/lib/produtos/parse";
import { montarInsert, montarUpdate } from "@/lib/produtos/montar";

// Kit por pessoa: criado só pela carga CSV. O formulário só oferece o tipo ao
// editar um produto que já é kit; nos demais casos a opção nem existe (os
// instantâneos de visibilidade dependem disso).

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ storage: { from: () => ({ uploadToSignedUrl: vi.fn() }) } }),
}));
vi.mock("@/lib/galeria/storage-servidor", () => ({
  verificarArquivosNovos: vi.fn(),
  limparArquivosSemLinha: vi.fn(),
  apagarPastaDoProduto: vi.fn(),
  criarEnviosAssinados: vi.fn(),
  criarEnvioCapa: vi.fn(),
  verificarCapaNova: vi.fn(),
  urlDaCapa: vi.fn(),
  limparPastaDaCapa: vi.fn(),
  apagarCapaAntiga: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/dal", () => ({ requireAuth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/galeria/reduzir", () => ({ reduzirFoto: vi.fn() }));

const { ProdutoForm } = await import("./produto-form");

const ID = "c7b3f34c-6f8f-4b39-a8fb-31369f1c4aee";

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => "blob:previa");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => cleanup());

function produto(tipo: string, categoria: string) {
  return {
    id: ID,
    slug: "x",
    nome: "Kit Festa Básico",
    preco: 22,
    descricao: "d",
    image_url: null,
    criado_em: null,
    pedido_minimo: 10,
    Categoria: categoria,
    prazo_producao_dias: 5,
    step_quantidade: "livre",
    destaque: true,
    ativo: false,
    tipo,
    unidade_venda: "a pessoa",
  } as never;
}

function renderizar(p?: ReturnType<typeof produto>) {
  return render(
    <ProdutoForm
      action={async () => ({})}
      produto={p}
      produtoId={ID}
      submitLabel="Salvar"
      produtosDisponiveis={[]}
      initialSubitens={[]}
      recheiosIniciais={[]}
      subcategorias={[]}
    />
  );
}

const opcoesDoTipo = () =>
  [...document.querySelectorAll<HTMLOptionElement>("#f-tipo option")].map((o) => o.value);

describe("formulário do produto e o tipo kit_pessoa", () => {
  it("produto novo e produto de outro tipo não têm a opção de kit", () => {
    renderizar();
    expect(opcoesDoTipo()).toEqual(["normal", "cento", "bolo", "bento_cake"]);
    cleanup();
    renderizar(produto("normal", "Doces"));
    expect(opcoesDoTipo()).toEqual(["normal", "cento", "bolo", "bento_cake"]);
  });

  it("kit existente: só o tipo kit, preço por pessoa, sem mínimo, step nem unidade", () => {
    renderizar(produto("kit_pessoa", "Kit Festa"));
    expect(opcoesDoTipo()).toEqual(["kit_pessoa"]);
    expect(document.querySelector("label[for='f-preco']")?.textContent).toContain("Preço por pessoa");
    for (const nome of ["pedido_minimo", "step_quantidade", "unidade_venda"]) {
      expect(document.querySelector(`[name="${nome}"]`), nome).toBeNull();
    }
  });
});

function envio(tipo: string) {
  const f = new FormData();
  for (const [k, v] of Object.entries({
    nome: "Kit Festa Básico",
    descricao: "d",
    preco: "22",
    pedido_minimo: "99",
    categoria: "Kit Festa",
    prazo_producao_dias: "5",
    step_quantidade: "multiplos_10",
    tipo,
    unidade_venda: "o kit",
    ativo: "on",
  })) {
    f.set(k, v);
  }
  return f;
}

describe("parser e montagem do kit", () => {
  it("o tipo exige a categoria Kit Festa", () => {
    const f = envio("kit_pessoa");
    f.set("categoria", "Doces");
    const r = parseProdutoForm(f);
    expect(r.success).toBe(false);
  });

  it("campo escondido é ignorado: unidade neutra é 'a pessoa', mínimo 1, step livre", () => {
    const r = parseProdutoForm(envio("kit_pessoa"));
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data).toMatchObject({ preco: 22, pedido_minimo: 1, step_quantidade: "livre", unidade_venda: "a pessoa" });
    expect(r.data.naoGravarNaEdicao.sort()).toEqual(["pedido_minimo", "step_quantidade", "unidade_venda"]);
  });

  it("a edição não grava mínimo, step nem unidade; o cadastro grava os neutros", () => {
    const r = parseProdutoForm(envio("kit_pessoa"));
    if (!r.success) throw new Error("parse");
    const edicao = montarUpdate(r.data);
    expect(Object.keys(edicao)).not.toEqual(expect.arrayContaining(["pedido_minimo"]));
    for (const c of ["pedido_minimo", "step_quantidade", "unidade_venda"]) expect(edicao).not.toHaveProperty(c);
    expect(edicao.preco).toBe(22);
    expect(montarInsert(r.data)).toMatchObject({ pedido_minimo: 1, step_quantidade: "livre", unidade_venda: "a pessoa", tipo: "kit_pessoa" });
  });

  it("tipos de antes mantêm a unidade neutra nula", () => {
    const f = envio("bolo");
    f.set("categoria", "Bolos");
    const r = parseProdutoForm(f);
    expect(r.success && r.data.unidade_venda).toBeNull();
  });
});
