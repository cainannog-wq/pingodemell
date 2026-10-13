import { beforeEach, describe, expect, it, vi } from "vitest";

// Server Actions das subcategorias contra um Supabase simulado: o teste não
// prova gatilho, chave composta nem RLS (isso é de scripts/banco/subcategorias.mjs).

const ID = "3f1c9a52-0000-4000-8000-000000000001";
const OUTRA = "3f1c9a52-0000-4000-8000-000000000002";
const TERCEIRA = "3f1c9a52-0000-4000-8000-000000000003";

type ErroBanco = { code?: string; message: string } | null;
const banco = {
  linhas: [] as { id: string; categoria: string; nome: string; ordem: number }[],
  erroEscrita: null as ErroBanco,
  erroEscritaDoId: {} as Record<string, ErroBanco>,
  linhasAfetadas: 1,
  produtosUsando: 0 as number | null,
  erroContagem: false,
  inserts: [] as Record<string, unknown>[],
  updates: [] as { id: string; valores: Record<string, unknown> }[],
  deletes: [] as string[],
};
const { updateTag, revalidatePath, requireAuth } = vi.hoisted(() => ({
  updateTag: vi.fn(),
  revalidatePath: vi.fn(),
  requireAuth: vi.fn(async () => ({ id: "admin" })),
}));

vi.mock("next/cache", () => ({ revalidatePath, updateTag }));
vi.mock("@/lib/supabase/dal", () => ({ requireAuth }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (tabela: string) => {
      if (tabela === "produtos") {
        return {
          select: () => ({
            eq: async () => ({
              count: banco.erroContagem ? null : banco.produtosUsando,
              error: banco.erroContagem ? { message: "falha" } : null,
            }),
          }),
        };
      }
      if (tabela !== "subcategorias") throw new Error(`tabela inesperada no mock: ${tabela}`);
      return {
        select: async () => ({ data: banco.linhas, error: null }),
        insert: async (valores: Record<string, unknown>) => {
          banco.inserts.push(valores);
          return { error: banco.erroEscrita };
        },
        update: (valores: Record<string, unknown>) => ({
          eq: (_coluna: string, id: string) => {
            const resposta = { error: banco.erroEscritaDoId[id] ?? banco.erroEscrita, data: Array(banco.linhasAfetadas).fill({ id }) };
            if (!resposta.error) banco.updates.push({ id, valores });
            return Object.assign(Promise.resolve(resposta), { select: async () => resposta });
          },
        }),
        delete: () => ({
          eq: (_coluna: string, id: string) => ({
            select: async () => {
              if (!banco.erroEscrita) banco.deletes.push(id);
              return { error: banco.erroEscrita, data: Array(banco.linhasAfetadas).fill({ id }) };
            },
          }),
        }),
      };
    },
  })),
}));

const { apagarSubcategoria, atualizarAtivoSubcategoria, criarSubcategoria, moverSubcategoria, renomearSubcategoria } =
  await import("./actions");

beforeEach(() => {
  banco.linhas = [];
  banco.erroEscrita = null;
  banco.erroEscritaDoId = {};
  banco.linhasAfetadas = 1;
  banco.produtosUsando = 0;
  banco.erroContagem = false;
  banco.inserts.length = 0;
  banco.updates.length = 0;
  banco.deletes.length = 0;
  updateTag.mockClear();
  revalidatePath.mockClear();
  requireAuth.mockClear();
});

describe("criar", () => {
  it("grava só categoria e nome (a ordem e o slug são do banco) e invalida a vitrine", async () => {
    expect(await criarSubcategoria("Doces", "  Doces   finos ")).toEqual({});
    expect(banco.inserts).toEqual([{ categoria: "Doces", nome: "Doces finos" }]);
    expect(updateTag).toHaveBeenCalledWith("vitrine");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/subcategorias");
    expect(requireAuth).toHaveBeenCalled();
  });

  it("recusa nome vazio, nome com mais de 80 e categoria desconhecida sem gravar", async () => {
    expect(await criarSubcategoria("Doces", "   ")).toEqual({ error: expect.stringMatching(/nome/) });
    expect(await criarSubcategoria("Doces", "a".repeat(81))).toEqual({ error: expect.stringMatching(/80/) });
    expect(await criarSubcategoria("Pratos", "Teste")).toEqual({ error: expect.stringMatching(/categoria/) });
    expect(banco.inserts).toHaveLength(0);
    expect(updateTag).not.toHaveBeenCalled();
  });

  it("traduz nome repetido (23505) e não invalida", async () => {
    banco.erroEscrita = { code: "23505", message: 'duplicate key value violates unique constraint "subcategorias_categoria_nome_key"' };
    const r = await criarSubcategoria("Doces", "Gourmet");
    expect(r.error).toBe("Já existe uma subcategoria com esse nome nesta categoria.");
    expect(updateTag).not.toHaveBeenCalled();
  });

  it("traduz o nome recusado pelo banco (23514) sem mostrar a mensagem crua", async () => {
    banco.erroEscrita = { code: "23514", message: 'new row violates check constraint "subcategorias_nome_formato"' };
    const r = await criarSubcategoria("Doces", "Gourmet");
    expect(r.error).toMatch(/1 a 80 caracteres/);
    expect(r.error).not.toContain("subcategorias_nome_formato");
  });
});

describe("renomear", () => {
  it("troca só o nome (nunca envia slug) e invalida", async () => {
    expect(await renomearSubcategoria(ID, " Novo  nome ")).toEqual({});
    expect(banco.updates).toEqual([{ id: ID, valores: { nome: "Novo nome" } }]);
    expect(updateTag).toHaveBeenCalledWith("vitrine");
  });

  it("id que não é uuid ou linha inexistente: mensagem em português", async () => {
    expect((await renomearSubcategoria("abc", "X")).error).toMatch(/não encontrada/);
    banco.linhasAfetadas = 0;
    expect((await renomearSubcategoria(ID, "X")).error).toMatch(/não encontrada/);
  });

  it("nome repetido: traduzido", async () => {
    banco.erroEscrita = { code: "23505", message: "cru" };
    expect((await renomearSubcategoria(ID, "Gourmet")).error).toMatch(/Já existe uma subcategoria/);
  });
});

describe("ativar e desativar", () => {
  it("desativar é sempre permitido e invalida", async () => {
    expect(await atualizarAtivoSubcategoria(ID, false)).toEqual({});
    expect(banco.updates).toEqual([{ id: ID, valores: { ativo: false } }]);
    expect(updateTag).toHaveBeenCalledWith("vitrine");
  });

  it("erro do banco volta traduzido e não invalida", async () => {
    banco.erroEscrita = { code: "42501", message: "permission denied for table subcategorias" };
    const r = await atualizarAtivoSubcategoria(ID, true);
    expect(r.error).not.toContain("permission denied");
    expect(updateTag).not.toHaveBeenCalled();
  });
});

describe("apagar", () => {
  it("apaga a subcategoria sem produto e invalida", async () => {
    expect(await apagarSubcategoria(ID)).toEqual({});
    expect(banco.deletes).toEqual([ID]);
    expect(updateTag).toHaveBeenCalledWith("vitrine");
  });

  it("com produto ligado (23503): conta os produtos, singular e plural, sem invalidar", async () => {
    banco.erroEscrita = { code: "23503", message: 'update or delete on table "subcategorias" violates foreign key constraint "produtos_subcategoria_fkey"' };
    banco.produtosUsando = 1;
    expect(await apagarSubcategoria(ID)).toEqual({ error: "1 produto usa esta subcategoria; desative em vez de apagar." });
    banco.produtosUsando = 12;
    expect(await apagarSubcategoria(ID)).toEqual({ error: "12 produtos usam esta subcategoria; desative em vez de apagar." });
    expect(updateTag).not.toHaveBeenCalled();
  });

  it("se a contagem falhar, a mensagem continua em português e sem texto do banco", async () => {
    banco.erroEscrita = { code: "23503", message: "cru" };
    banco.erroContagem = true;
    const r = await apagarSubcategoria(ID);
    expect(r.error).toMatch(/em uso por produtos/);
  });

  it("já apagada por outra pessoa: avisa", async () => {
    banco.linhasAfetadas = 0;
    expect((await apagarSubcategoria(ID)).error).toMatch(/não encontrada/);
  });
});

describe("mover (setas)", () => {
  beforeEach(() => {
    banco.linhas = [
      { id: ID, categoria: "Doces", nome: "A", ordem: 10 },
      { id: OUTRA, categoria: "Doces", nome: "B", ordem: 20 },
      { id: TERCEIRA, categoria: "Bolos", nome: "C", ordem: 10 },
    ];
  });

  it("descer troca com a vizinha da MESMA categoria e grava só as linhas que mudam", async () => {
    expect(await moverSubcategoria(ID, "descer")).toEqual({});
    expect(banco.updates).toEqual([
      { id: OUTRA, valores: { ordem: 10 } },
      { id: ID, valores: { ordem: 20 } },
    ]);
    expect(updateTag).toHaveBeenCalledWith("vitrine");
  });

  it("primeira subindo e última descendo: nada é gravado", async () => {
    expect(await moverSubcategoria(ID, "subir")).toEqual({});
    expect(await moverSubcategoria(OUTRA, "descer")).toEqual({});
    expect(banco.updates).toHaveLength(0);
  });

  it("categoria com uma só subcategoria: nada é gravado", async () => {
    expect(await moverSubcategoria(TERCEIRA, "descer")).toEqual({});
    expect(banco.updates).toHaveLength(0);
  });

  it("id que sumiu: avisa; direção inválida: recusa", async () => {
    expect((await moverSubcategoria("3f1c9a52-0000-4000-8000-0000000000ff", "subir")).error).toMatch(/não encontrada/);
    expect((await moverSubcategoria(ID, "lado" as never)).error).toMatch(/não encontrada/);
  });

  it("falha numa das gravações: invalida mesmo assim (uma linha pode ter mudado) e avisa", async () => {
    banco.erroEscritaDoId[ID] = { code: "XX000", message: "cru" };
    const r = await moverSubcategoria(ID, "descer");
    expect(r.error).toMatch(/Não foi possível/);
    expect(updateTag).toHaveBeenCalledWith("vitrine");
  });
});

describe("todas as ações exigem login", () => {
  it("chamam requireAuth antes de qualquer coisa", async () => {
    await criarSubcategoria("Doces", "X");
    await renomearSubcategoria(ID, "X");
    await atualizarAtivoSubcategoria(ID, true);
    await moverSubcategoria(ID, "subir");
    await apagarSubcategoria(ID);
    expect(requireAuth).toHaveBeenCalledTimes(5);
  });
});
