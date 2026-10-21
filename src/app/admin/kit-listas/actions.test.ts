import { beforeEach, describe, expect, it, vi } from "vitest";

// Server Actions do editor de listas do kit contra um Supabase simulado: o
// teste não prova a unicidade adiada, a chave composta nem a RLS (isso é de
// scripts/banco/kit-pessoa.mjs, testes 59 a 64). Aqui se prova o que o
// servidor manda: um upsert único por id na reordenação e nenhum delete.

const ITEM = "3f1c9a52-0000-4000-8000-000000000011";
const OUTRO = "3f1c9a52-0000-4000-8000-000000000012";
const TERCEIRO = "3f1c9a52-0000-4000-8000-000000000013";
const LISTA = "3f1c9a52-0000-4000-8000-000000000001";

type ErroBanco = { code?: string; message: string } | null;
const banco = {
  itens: [] as { id: string; lista_id: string; nome: string; descricao: string | null; posicao: number; ativo: boolean }[],
  erroEscrita: null as ErroBanco,
  linhasAfetadas: 1,
  inserts: [] as Record<string, unknown>[],
  updates: [] as { id: string; valores: Record<string, unknown> }[],
  upserts: [] as { linhas: Record<string, unknown>[]; opcoes: unknown }[],
  deletes: 0,
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
      if (tabela !== "kit_lista_itens") throw new Error(`tabela inesperada no mock: ${tabela}`);
      return {
        select: () => ({
          eq: (coluna: string, valor: string) => {
            const linhas = banco.itens.filter((i) => (i as Record<string, unknown>)[coluna] === valor);
            return Object.assign(Promise.resolve({ data: linhas, error: null }), {
              maybeSingle: async () => ({ data: linhas[0] ?? null, error: null }),
            });
          },
        }),
        insert: async (valores: Record<string, unknown>) => {
          banco.inserts.push(valores);
          return { error: banco.erroEscrita };
        },
        update: (valores: Record<string, unknown>) => ({
          eq: (_coluna: string, id: string) => {
            const resposta = { error: banco.erroEscrita, data: Array(banco.linhasAfetadas).fill({ id }) };
            if (!resposta.error) banco.updates.push({ id, valores });
            return { select: async () => resposta };
          },
        }),
        upsert: async (linhas: Record<string, unknown>[], opcoes: unknown) => {
          banco.upserts.push({ linhas, opcoes });
          return { error: banco.erroEscrita };
        },
        delete: () => {
          banco.deletes += 1;
          return { eq: async () => ({ error: null }) };
        },
      };
    },
  })),
}));

const { adicionarOpcao, atualizarAtivoOpcao, editarOpcao, moverOpcao } = await import("./actions");

const linha = (id: string, nome: string, posicao: number) => ({ id, lista_id: LISTA, nome, descricao: null, posicao, ativo: true });

beforeEach(() => {
  banco.itens = [];
  banco.erroEscrita = null;
  banco.linhasAfetadas = 1;
  banco.inserts.length = 0;
  banco.updates.length = 0;
  banco.upserts.length = 0;
  banco.deletes = 0;
  updateTag.mockClear();
  revalidatePath.mockClear();
  requireAuth.mockClear();
});

describe("adicionar", () => {
  it("entra na próxima posição, com a descrição opcional, e invalida a vitrine", async () => {
    banco.itens = [linha(ITEM, "A", 1), linha(OUTRO, "B", 2)];
    expect(await adicionarOpcao(LISTA, "  Ouro  branco ", "")).toEqual({});
    expect(banco.inserts).toEqual([{ lista_id: LISTA, nome: "Ouro branco", descricao: null, posicao: 3 }]);
    expect(updateTag).toHaveBeenCalledWith("vitrine");
    expect(requireAuth).toHaveBeenCalled();
  });

  it("recusa nome vazio, lista inválida e erro do banco sem mostrar a mensagem crua", async () => {
    expect((await adicionarOpcao(LISTA, "  ", "")).error).toMatch(/nome da opção/);
    expect((await adicionarOpcao("x", "A", "")).error).toMatch(/Lista não encontrada/);
    banco.erroEscrita = { code: "23505", message: 'duplicate key "kit_lista_itens_nome_unico"' };
    const r = await adicionarOpcao(LISTA, "A", "");
    expect(r.error).toMatch(/Já existe uma opção/);
    expect(r.error).not.toMatch(/kit_lista_itens/);
  });
});

describe("editar, ativar e desativar", () => {
  it("renomear e descrever é um update por id", async () => {
    expect(await editarOpcao(ITEM, " Novo nome ", " acréscimo a combinar ")).toEqual({});
    expect(banco.updates).toEqual([{ id: ITEM, valores: { nome: "Novo nome", descricao: "acréscimo a combinar" } }]);
    expect(updateTag).toHaveBeenCalledWith("vitrine");
  });

  it("opção inexistente devolve o aviso", async () => {
    banco.linhasAfetadas = 0;
    expect((await editarOpcao(ITEM, "A", "")).error).toMatch(/não encontrada/);
    expect((await atualizarAtivoOpcao(ITEM, false)).error).toMatch(/não encontrada/);
  });

  it("desativar só muda ativo", async () => {
    expect(await atualizarAtivoOpcao(ITEM, false)).toEqual({});
    expect(banco.updates).toEqual([{ id: ITEM, valores: { ativo: false } }]);
  });
});

describe("mover", () => {
  it("troca duas posições com UM upsert por id e nenhum delete", async () => {
    banco.itens = [linha(ITEM, "A", 1), linha(OUTRO, "B", 2), linha(TERCEIRO, "C", 3)];
    expect(await moverOpcao(OUTRO, "subir")).toEqual({});
    expect(banco.upserts).toHaveLength(1);
    expect(banco.upserts[0].opcoes).toEqual({ onConflict: "id" });
    expect(banco.upserts[0].linhas).toEqual([
      { id: OUTRO, lista_id: LISTA, nome: "B", posicao: 1 },
      { id: ITEM, lista_id: LISTA, nome: "A", posicao: 2 },
    ]);
    expect(banco.updates).toEqual([]);
    expect(banco.deletes).toBe(0);
    expect(updateTag).toHaveBeenCalledWith("vitrine");
  });

  it("primeiro subindo: nada é gravado", async () => {
    banco.itens = [linha(ITEM, "A", 1), linha(OUTRO, "B", 2)];
    expect(await moverOpcao(ITEM, "subir")).toEqual({});
    expect(banco.upserts).toHaveLength(0);
  });

  it("id desconhecido e direção inválida", async () => {
    expect((await moverOpcao(ITEM, "subir")).error).toMatch(/não encontrada/);
    expect((await moverOpcao(ITEM, "lado" as never)).error).toMatch(/não encontrada/);
  });

  it("falha do upsert vira mensagem traduzida", async () => {
    banco.itens = [linha(ITEM, "A", 1), linha(OUTRO, "B", 2)];
    banco.erroEscrita = { code: "23505", message: "boom" };
    expect((await moverOpcao(OUTRO, "subir")).error).toMatch(/Já existe/);
  });
});
