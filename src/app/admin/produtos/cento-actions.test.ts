import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock genérico do client Supabase cobrindo as duas tabelas usadas pelas
// Server Actions de produto: "produtos" (insert/update, sem RLS aqui pois
// é o mock) e "produto_cento_itens" (delete + insert, substituindo a lista
// inteira de subitens a cada save — ver actions.ts).
const insertCalls: { table: string; payload: unknown }[] = [];
const updateCalls: { table: string; payload: unknown }[] = [];
const deleteCalls: { table: string; column: string; value: string }[] = [];

function makeFromMock() {
  return vi.fn((table: string) => {
    if (table === "produtos") {
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: null }) }),
        }),
        insert: async (payload: unknown) => {
          insertCalls.push({ table, payload });
          return { error: null };
        },
        update: (payload: unknown) => ({
          eq: async () => {
            updateCalls.push({ table, payload });
            return { error: null };
          },
        }),
      };
    }
    if (table === "produto_cento_itens") {
      return {
        delete: () => ({
          eq: async (column: string, value: string) => {
            deleteCalls.push({ table, column, value });
            return { error: null };
          },
        }),
        insert: async (payload: unknown) => {
          insertCalls.push({ table, payload });
          return { error: null };
        },
      };
    }
    throw new Error(`tabela inesperada no mock: ${table}`);
  });
}

let fromMock = makeFromMock();

vi.mock("@/lib/supabase/dal", () => ({
  requireAuth: vi.fn().mockResolvedValue({ id: "user-1" }),
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

function buildFormData(fields: Record<string, string>, subitens: string[] = []) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }
  for (const subitem of subitens) {
    formData.append("subitem_nome", subitem);
  }
  return formData;
}

const CAMPOS_CENTO = {
  nome: "Cento de salgados sortidos",
  preco: "90,00",
  pedido_minimo: "1",
  prazo_producao_dias: "2",
  step_quantidade: "livre",
  tipo: "cento",
};

describe("createProduto — tipo Cento", () => {
  beforeEach(() => {
    insertCalls.length = 0;
    updateCalls.length = 0;
    deleteCalls.length = 0;
    fromMock = makeFromMock();
  });

  it("insere o produto com tipo 'cento' e grava os subitens na ordem escolhida", async () => {
    const { createProduto } = await import("./actions");
    const formData = buildFormData(CAMPOS_CENTO, ["Coxinha de frango", "Risole de carne", "Empada de palmito"]);

    await createProduto({}, formData);

    const produtoInsert = insertCalls.find((c) => c.table === "produtos");
    expect(produtoInsert?.payload).toMatchObject({ nome: "Cento de salgados sortidos", tipo: "cento" });

    const itensInsert = insertCalls.find((c) => c.table === "produto_cento_itens");
    expect(itensInsert?.payload).toEqual([
      { cento_nome: "Cento de salgados sortidos", subitem_nome: "Coxinha de frango", ordem: 0 },
      { cento_nome: "Cento de salgados sortidos", subitem_nome: "Risole de carne", ordem: 1 },
      { cento_nome: "Cento de salgados sortidos", subitem_nome: "Empada de palmito", ordem: 2 },
    ]);
  });

  it("não grava nenhum subitem para um produto tipo 'normal'", async () => {
    const { createProduto } = await import("./actions");
    const formData = buildFormData({ ...CAMPOS_CENTO, nome: "Bolo normal", tipo: "normal" });

    await createProduto({}, formData);

    const itensInsert = insertCalls.find((c) => c.table === "produto_cento_itens");
    expect(itensInsert).toBeUndefined();
  });
});

describe("updateProduto — edição da lista de subitens", () => {
  beforeEach(() => {
    insertCalls.length = 0;
    updateCalls.length = 0;
    deleteCalls.length = 0;
    fromMock = makeFromMock();
  });

  it("substitui a lista de subitens inteira (delete + insert) ao adicionar e remover item", async () => {
    const { updateProduto } = await import("./actions");
    const formData = buildFormData(CAMPOS_CENTO, ["Coxinha de frango", "Empada de palmito"]);

    await updateProduto("Cento de salgados sortidos", {}, formData);

    const del = deleteCalls.find((c) => c.table === "produto_cento_itens");
    expect(del).toMatchObject({ column: "cento_nome", value: "Cento de salgados sortidos" });

    const itensInsert = insertCalls.find((c) => c.table === "produto_cento_itens");
    expect(itensInsert?.payload).toEqual([
      { cento_nome: "Cento de salgados sortidos", subitem_nome: "Coxinha de frango", ordem: 0 },
      { cento_nome: "Cento de salgados sortidos", subitem_nome: "Empada de palmito", ordem: 1 },
    ]);
  });

  it("limpa os subitens quando o produto deixa de ser do tipo 'cento'", async () => {
    const { updateProduto } = await import("./actions");
    const formData = buildFormData({ ...CAMPOS_CENTO, tipo: "normal" });

    await updateProduto("Cento de salgados sortidos", {}, formData);

    const del = deleteCalls.find((c) => c.table === "produto_cento_itens");
    expect(del).toMatchObject({ column: "cento_nome", value: "Cento de salgados sortidos" });

    const itensInsert = insertCalls.find((c) => c.table === "produto_cento_itens");
    expect(itensInsert).toBeUndefined();
  });
});
