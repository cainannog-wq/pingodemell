import { beforeEach, describe, expect, it, vi } from "vitest";

// Server Actions de produto com recheios personalizados (produto_recheios),
// contra um cliente do Supabase simulado (nada é gravado): o servidor confere
// a lista antes de gravar o produto, e grava a lista pela função
// salvar_produto_recheios depois.
const ID = "c7b3f34c-6f8f-4b39-a8fb-31369f1c4aee";
const insertCalls: unknown[] = [];
const updateCalls: unknown[] = [];
const rpcCalls: { nome: string; args: Record<string, unknown> }[] = [];
let erroDoRpc: { message: string } | null = null;

function makeFrom() {
  return vi.fn((table: string) => {
    if (table === "produtos") {
      return {
        select: (colunas: string) => ({
          eq: () => ({
            maybeSingle: async () => ({ data: colunas.startsWith("id") ? { id: ID, image_url: null } : null }),
          }),
        }),
        insert: async (payload: unknown) => {
          insertCalls.push(payload);
          return { error: null };
        },
        update: (payload: unknown) => ({
          eq: async () => {
            updateCalls.push(payload);
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
const rpc = vi.fn(async (nome: string, args: Record<string, unknown>) => {
  rpcCalls.push({ nome, args });
  return { error: erroDoRpc };
});

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
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ from: makeFrom(), rpc })) }));

function form(campos: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}
const lista = (...nomes: string[]) => JSON.stringify(nomes.map((nome) => ({ nome })));
const GANACHE = { id: ID, nome: "Bolo Ganache", preco: "108,00", pedido_minimo: "1", step_quantidade: "livre", prazo_producao_dias: "3", categoria: "Bolos", tipo: "normal" };

beforeEach(() => {
  insertCalls.length = 0;
  updateCalls.length = 0;
  rpcCalls.length = 0;
  erroDoRpc = null;
  rpc.mockClear();
});

describe("createProduto — recheios personalizados", () => {
  it("grava o produto e depois a lista, na ordem recebida", async () => {
    const { createProduto } = await import("./actions");
    await createProduto({}, form({ ...GANACHE, recheios_ligados: "1", recheios_produto: lista("Dois amores", "Ouro branco") }));
    expect(insertCalls).toHaveLength(1);
    expect(rpcCalls).toEqual([
      { nome: "salvar_produto_recheios", args: { p_produto_id: ID, p_recheios: [{ nome: "Dois amores" }, { nome: "Ouro branco" }] } },
    ]);
  });

  it("interruptor ligado com a lista vazia: recusa, sem gravar nada", async () => {
    const { createProduto } = await import("./actions");
    const r = await createProduto({}, form({ ...GANACHE, recheios_ligados: "1", recheios_produto: "[]" }));
    expect(r.error).toMatch(/pelo menos um recheio/);
    expect(insertCalls).toHaveLength(0);
    expect(rpcCalls).toHaveLength(0);
  });

  it("recheio repetido (sem acento nem maiúscula) ou em branco: recusa, sem gravar nada", async () => {
    const { createProduto } = await import("./actions");
    const repetido = await createProduto({}, form({ ...GANACHE, recheios_ligados: "1", recheios_produto: lista("Prestígio", "prestigio") }));
    expect(repetido.error).toMatch(/repetido/);
    const branco = await createProduto({}, form({ ...GANACHE, recheios_ligados: "1", recheios_produto: lista("Ninho", "  ") }));
    expect(branco.error).toMatch(/em branco/);
    expect(insertCalls).toHaveLength(0);
  });

  it("Bolo tradicional e categoria fora de Bolos e Bento Cake não aceitam lista", async () => {
    const { createProduto } = await import("./actions");
    const comLista = { recheios_ligados: "1", recheios_produto: lista("Ninho") };
    const tradicional = await createProduto({}, form({ id: ID, nome: "Bolo", prazo_producao_dias: "2", categoria: "Bolos", tipo: "bolo", ...comLista }));
    expect(tradicional.error).toMatch(/só existem para Bolos/);
    const doce = await createProduto({}, form({ ...GANACHE, categoria: "Doces", ...comLista }));
    expect(doce.error).toMatch(/só existem para Bolos/);
    expect(insertCalls).toHaveLength(0);
  });

  it("sem o campo no envio, a função de recheios nem é chamada", async () => {
    const { createProduto } = await import("./actions");
    await createProduto({}, form(GANACHE));
    expect(insertCalls).toHaveLength(1);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("falha ao gravar a lista: o produto já foi salvo e a mensagem diz para salvar de novo", async () => {
    const { createProduto } = await import("./actions");
    erroDoRpc = { message: "boom" };
    const r = await createProduto({}, form({ ...GANACHE, recheios_ligados: "1", recheios_produto: lista("Ninho") }));
    expect(r.error).toMatch(/Produto salvo, mas os recheios não foram salvos/);
    expect(insertCalls).toHaveLength(1);
  });
});

describe("updateProduto — recheios personalizados", () => {
  it("edita a lista mantendo o id de quem já existia", async () => {
    const { updateProduto } = await import("./actions");
    const idAntigo = "11111111-1111-4111-8111-111111111111";
    await updateProduto(
      "Bolo Ganache",
      {},
      form({ ...GANACHE, recheios_ligados: "1", recheios_produto: JSON.stringify([{ id: idAntigo, nome: "Ouro branco" }, { nome: "Novo" }]) })
    );
    expect(rpcCalls[0].args).toEqual({ p_produto_id: ID, p_recheios: [{ id: idAntigo, nome: "Ouro branco" }, { nome: "Novo" }] });
  });

  it("interruptor desligado apaga a lista salva (lista vazia vai para a função)", async () => {
    const { updateProduto } = await import("./actions");
    await updateProduto("Bolo Ganache", {}, form({ ...GANACHE, recheios_ligados: "0", recheios_produto: "[]" }));
    expect(rpcCalls[0].args).toEqual({ p_produto_id: ID, p_recheios: [] });
  });

  it("lista vazia com o interruptor ligado: recusa e não grava o produto", async () => {
    const { updateProduto } = await import("./actions");
    const r = await updateProduto("Bolo Ganache", {}, form({ ...GANACHE, recheios_ligados: "1", recheios_produto: "[]" }));
    expect(r.error).toMatch(/pelo menos um recheio/);
    expect(updateCalls).toHaveLength(0);
  });

  it("sem o campo no envio, a lista salva não é tocada", async () => {
    const { updateProduto } = await import("./actions");
    await updateProduto("Bolo Ganache", {}, form(GANACHE));
    expect(updateCalls).toHaveLength(1);
    expect(rpc).not.toHaveBeenCalled();
  });
});
