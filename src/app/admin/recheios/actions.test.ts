import { beforeEach, describe, expect, it, vi } from "vitest";

// Server Actions do catálogo de recheios contra um cliente do Supabase
// simulado (nada é gravado).
const insertCalls: unknown[] = [];
const updateCalls: { payload: Record<string, unknown>; id: string }[] = [];
let erroDoBanco: { code?: string; message: string } | null = null;
let linhasAtualizadas: { id: string }[] = [{ id: "x" }];

vi.mock("@/lib/supabase/dal", () => ({ requireAuth: vi.fn().mockResolvedValue({ id: "user-1" }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (tabela: string) => {
      if (tabela !== "recheios") throw new Error(`tabela inesperada: ${tabela}`);
      return {
        insert: async (payload: unknown) => {
          insertCalls.push(payload);
          return { error: erroDoBanco };
        },
        update: (payload: Record<string, unknown>) => ({
          eq: (_coluna: string, id: string) => {
            updateCalls.push({ payload, id });
            const resultado = { data: linhasAtualizadas, error: erroDoBanco };
            return { select: async () => resultado, then: (ok: (v: unknown) => unknown) => Promise.resolve(resultado).then(ok) };
          },
        }),
      };
    },
  })),
}));

const ID = "c7b3f34c-6f8f-4b39-a8fb-31369f1c4aee";

function form(campos: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

beforeEach(() => {
  insertCalls.length = 0;
  updateCalls.length = 0;
  erroDoBanco = null;
  linhasAtualizadas = [{ id: "x" }];
});

describe("createRecheio", () => {
  it("grava recheio do Bolo com preço e grupo, sem enviar vale_bento", async () => {
    const { createRecheio } = await import("./actions");
    await createRecheio({}, form({ nome: "Brigadeiro", preco_kg: "80.00", grupo: "chocolate_outros", ativo: "on" }));
    expect(insertCalls).toEqual([{ nome: "Brigadeiro", vale_bolo: true, preco_kg: 80, grupo: "chocolate_outros", ativo: true }]);
    expect("vale_bento" in (insertCalls[0] as object)).toBe(false);
  });

  it("dado inválido volta com o erro e não grava", async () => {
    const { createRecheio } = await import("./actions");
    const r = await createRecheio({}, form({ nome: "Sem preço" }));
    expect(r.error).toMatch(/preço por kg/i);
    expect(insertCalls).toHaveLength(0);
  });

  it("nome repetido (índice único do banco) vira mensagem clara", async () => {
    const { createRecheio } = await import("./actions");
    erroDoBanco = { code: "23505", message: "duplicate key" };
    const r = await createRecheio({}, form({ nome: "Ninho", preco_kg: "50", grupo: "frutas" }));
    expect(r.error).toBe("Já existe um recheio com esse nome.");
  });
});

describe("updateRecheio e updateRecheioAtivo", () => {
  it("edita pelo id; id que não é uuid é recusado antes de ir ao banco", async () => {
    const { updateRecheio } = await import("./actions");
    await updateRecheio(ID, {}, form({ nome: "Ninho", preco_kg: "50", grupo: "frutas", ativo: "on" }));
    // vale_bento nunca vai: a coluna e o que está nela ficam como estão.
    expect(updateCalls).toEqual([{ id: ID, payload: { nome: "Ninho", vale_bolo: true, preco_kg: 50, grupo: "frutas", ativo: true } }]);
    updateCalls.length = 0;
    const r = await updateRecheio("nao-e-uuid", {}, form({ nome: "Ninho", preco_kg: "50", grupo: "frutas" }));
    expect(r.error).toMatch(/não encontrado/);
    expect(updateCalls).toHaveLength(0);
  });

  it("id inexistente (nenhuma linha atualizada) avisa", async () => {
    const { updateRecheio } = await import("./actions");
    linhasAtualizadas = [];
    const r = await updateRecheio(ID, {}, form({ nome: "Ninho", preco_kg: "50", grupo: "frutas" }));
    expect(r.error).toMatch(/não encontrado/);
  });

  it("desativar só muda ativo; nunca apaga", async () => {
    const { updateRecheioAtivo } = await import("./actions");
    expect(await updateRecheioAtivo(ID, false)).toEqual({});
    expect(updateCalls).toEqual([{ id: ID, payload: { ativo: false } }]);
  });

  it("não existe ação de excluir recheio", async () => {
    const acoes = await import("./actions");
    expect(Object.keys(acoes).sort()).toEqual(["createRecheio", "updateRecheio", "updateRecheioAtivo"]);
  });
});
