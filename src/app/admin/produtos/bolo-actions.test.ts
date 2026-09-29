import { beforeEach, describe, expect, it, vi } from "vitest";

// Server Actions de produto com tipo Bolo e Bento Cake, contra um cliente do
// Supabase simulado (nada é gravado): o Bolo não usa preço, pedido mínimo,
// step nem unidade, e a edição não mexe no que já está no banco.
const insertCalls: { table: string; payload: unknown }[] = [];
const updateCalls: { table: string; payload: Record<string, unknown> }[] = [];

function makeFromMock() {
  return vi.fn((table: string) => {
    if (table === "produtos") {
      return {
        select: (colunas: string) => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: colunas.startsWith("id") ? { id: "c7b3f34c-6f8f-4b39-a8fb-31369f1c4aee", image_url: null } : null,
            }),
          }),
        }),
        insert: async (payload: unknown) => {
          insertCalls.push({ table, payload });
          return { error: null };
        },
        update: (payload: Record<string, unknown>) => ({
          eq: async () => {
            updateCalls.push({ table, payload });
            return { error: null };
          },
        }),
      };
    }
    if (table === "produto_cento_itens") {
      return { delete: () => ({ eq: async () => ({ error: null }) }), insert: async () => ({ error: null }) };
    }
    throw new Error(`tabela inesperada no mock: ${table}`);
  });
}

let fromMock = makeFromMock();

vi.mock("@/lib/supabase/dal", () => ({ requireAuth: vi.fn().mockResolvedValue({ id: "user-1" }) }));
vi.mock("@/lib/galeria/storage-servidor", () => ({
  verificarArquivosNovos: vi.fn(async () => null),
  limparArquivosSemLinha: vi.fn(async () => 0),
  apagarPastaDoProduto: vi.fn(async () => 0),
  criarEnviosAssinados: vi.fn(async () => []),
  criarEnvioCapa: vi.fn(),
  verificarCapaNova: vi.fn(async () => null),
  urlDaCapa: vi.fn(),
  limparPastaDaCapa: vi.fn(async () => 0),
  apagarCapaAntiga: vi.fn(async () => "sem-capa"),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ from: fromMock })) }));

function form(campos: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

const ID = "c7b3f34c-6f8f-4b39-a8fb-31369f1c4aee";
// Como o formulário manda um Bolo: os campos escondidos nem existem.
const BOLO = { id: ID, nome: "Bolo de Chocolate com Ninho", prazo_producao_dias: "2", categoria: "Bolos", tipo: "bolo" };
const BENTO = {
  id: ID,
  nome: "Bento Cake Flork",
  preco: "60,00",
  pedido_minimo: "2",
  prazo_producao_dias: "2",
  categoria: "Bento Cake",
  tipo: "bento_cake",
};

beforeEach(() => {
  insertCalls.length = 0;
  updateCalls.length = 0;
  fromMock = makeFromMock();
});

describe("createProduto — Bolo e Bento Cake", () => {
  it("Bolo novo: sem preço, mínimo, step nem unidade no formulário; grava valores neutros", async () => {
    const { createProduto } = await import("./actions");
    await createProduto({}, form(BOLO));
    expect(insertCalls.find((c) => c.table === "produtos")?.payload).toMatchObject({
      tipo: "bolo",
      Categoria: "Bolos",
      preco: 0,
      pedido_minimo: 1,
      step_quantidade: "livre",
      unidade_venda: null,
    });
  });

  it("Bolo: preço, mínimo, step e unidade que chegarem à força são ignorados", async () => {
    const { createProduto } = await import("./actions");
    await createProduto({}, form({ ...BOLO, preco: "99", pedido_minimo: "7", step_quantidade: "multiplos_10", unidade_venda: "kg" }));
    expect(insertCalls.find((c) => c.table === "produtos")?.payload).toMatchObject({
      preco: 0,
      pedido_minimo: 1,
      step_quantidade: "livre",
      unidade_venda: null,
    });
  });

  it("Bento Cake novo: preço e mínimo valem; step livre e sem unidade", async () => {
    const { createProduto } = await import("./actions");
    await createProduto({}, form({ ...BENTO, step_quantidade: "multiplos_5", unidade_venda: "kg" }));
    expect(insertCalls.find((c) => c.table === "produtos")?.payload).toMatchObject({
      tipo: "bento_cake",
      Categoria: "Bento Cake",
      preco: 60,
      pedido_minimo: 2,
      step_quantidade: "livre",
      unidade_venda: null,
    });
  });

  it("combinação inválida é recusada sem gravar nada", async () => {
    const { createProduto } = await import("./actions");
    const r = await createProduto({}, form({ ...BOLO, categoria: "Doces" }));
    expect(r.error).toMatch(/categoria Bolos/);
    const r2 = await createProduto({}, form({ ...BENTO, tipo: "normal", step_quantidade: "livre" }));
    expect(r2.error).toMatch(/categoria Bento Cake exige/);
    expect(insertCalls).toHaveLength(0);
  });
});

describe("updateProduto — Bolo preserva o que já está no banco", () => {
  it("a edição de um Bolo não grava preço, mínimo, step nem unidade", async () => {
    const { updateProduto } = await import("./actions");
    await updateProduto("Bolo de Chocolate com Ninho", {}, form(BOLO));
    const payload = updateCalls[0].payload;
    expect(payload).toMatchObject({ nome: "Bolo de Chocolate com Ninho", tipo: "bolo", Categoria: "Bolos", prazo_producao_dias: 2 });
    for (const coluna of ["preco", "pedido_minimo", "step_quantidade", "unidade_venda"]) {
      expect(payload).not.toHaveProperty(coluna);
    }
  });

  it("produto normal continua gravando todos os campos", async () => {
    const { updateProduto } = await import("./actions");
    await updateProduto(
      "Brigadeiro",
      {},
      form({ id: ID, nome: "Brigadeiro", preco: "3,50", pedido_minimo: "10", prazo_producao_dias: "1", step_quantidade: "livre", categoria: "Doces", tipo: "normal" })
    );
    expect(updateCalls[0].payload).toMatchObject({ preco: 3.5, pedido_minimo: 10, step_quantidade: "livre", unidade_venda: null });
  });
});
