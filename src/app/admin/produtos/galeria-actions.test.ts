import { beforeEach, describe, expect, it, vi } from "vitest";

// Server Actions de produto na parte da galeria de fotos extras. O banco
// é simulado: produto_fotos guarda as linhas atuais e a função
// salvar_produto_fotos (rpc) grava a lista final — ou falha, quando o
// teste pede. As operações de storage (chave de serviço) são espiadas.

const PRODUTO = "8b4f3b06-7e38-4d9e-ad8e-3a6a4935e1a1";
const F1 = "11111111-0000-4000-8000-000000000000";
const F2 = "22222222-0000-4000-8000-000000000000";
const F3 = "33333333-0000-4000-8000-000000000000";
const NOVO = "99999999-0000-4000-8000-000000000000";
const caminho = (id: string, ext = "webp") => `galeria/${PRODUTO}/${id}.${ext}`;

type Linha = { id: string; caminho: string };
let linhas: Linha[] = [];
let erroRpc: string | null = null;
const rpcs: { fn: string; args: { p_produto_id: string; p_fotos: unknown[] } }[] = [];
const produtosUpdates: unknown[] = [];
const produtosDeletes: string[] = [];

const requireAuth = vi.fn();
const redirect = vi.fn();
const storage = {
  verificarArquivosNovos: vi.fn(async (): Promise<string | null> => null),
  limparArquivosSemLinha: vi.fn<(id: string, manter: Iterable<string>) => Promise<number>>(async () => 0),
  apagarPastaDoProduto: vi.fn<(id: string) => Promise<number>>(async () => 0),
  criarEnviosAssinados: vi.fn(async () => []),
};

vi.mock("@/lib/supabase/dal", () => ({ requireAuth: () => requireAuth() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }));
vi.mock("@/lib/galeria/storage-servidor", () => ({
  verificarArquivosNovos: (...a: unknown[]) => storage.verificarArquivosNovos(...(a as [])),
  limparArquivosSemLinha: (...a: [string, Iterable<string>]) => storage.limparArquivosSemLinha(...a),
  apagarPastaDoProduto: (id: string) => storage.apagarPastaDoProduto(id),
  criarEnviosAssinados: (...a: unknown[]) => storage.criarEnviosAssinados(...(a as [])),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (tabela: string) => {
      if (tabela === "produtos") {
        return {
          select: (colunas: string) => ({
            eq: () => ({ maybeSingle: async () => ({ data: colunas === "id" ? { id: PRODUTO } : null }) }),
          }),
          insert: async () => ({ error: null }),
          update: (payload: unknown) => ({
            eq: async () => {
              produtosUpdates.push(payload);
              return { error: null };
            },
          }),
          delete: () => ({
            eq: async (_c: string, nome: string) => {
              produtosDeletes.push(nome);
              linhas = []; // cascata do banco
              return { error: null };
            },
          }),
        };
      }
      if (tabela === "produto_fotos") {
        return { select: () => ({ eq: () => ({ order: async () => ({ data: [...linhas], error: null }) }) }) };
      }
      if (tabela === "produto_cento_itens") {
        return { delete: () => ({ eq: async () => ({ error: null }) }), insert: async () => ({ error: null }) };
      }
      throw new Error(`tabela inesperada: ${tabela}`);
    },
    rpc: async (fn: string, args: { p_produto_id: string; p_fotos: ({ id: string } | { caminho: string })[] }) => {
      rpcs.push({ fn, args });
      if (erroRpc) return { error: { message: erroRpc } };
      linhas = args.p_fotos.map((f) => ("id" in f ? linhas.find((l) => l.id === f.id)! : { id: crypto.randomUUID(), caminho: f.caminho }));
      return { error: null };
    },
  })),
}));

const { createProduto, updateProduto, deleteProduto, prepararEnvioFotos, descartarEnviosFotos } = await import("./actions");

const CAMPOS = {
  nome: "Morango Banhado",
  preco: "5,00",
  pedido_minimo: "1",
  prazo_producao_dias: "1",
  step_quantidade: "livre",
  tipo: "normal",
};

function form(galeria?: unknown[], extra: Record<string, string> = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ ...CAMPOS, ...extra })) fd.set(k, v);
  if (galeria) fd.set("galeria", JSON.stringify(galeria));
  return fd;
}

beforeEach(() => {
  linhas = [
    { id: F1, caminho: caminho(F1) },
    { id: F2, caminho: caminho(F2) },
    { id: F3, caminho: caminho(F3, "jpg") },
  ];
  erroRpc = null;
  rpcs.length = 0;
  produtosUpdates.length = 0;
  produtosDeletes.length = 0;
  requireAuth.mockReset().mockResolvedValue({ id: "admin" });
  redirect.mockReset();
  for (const fn of Object.values(storage)) fn.mockClear();
  storage.verificarArquivosNovos.mockResolvedValue(null);
  storage.limparArquivosSemLinha.mockResolvedValue(0);
  storage.apagarPastaDoProduto.mockResolvedValue(0);
});

describe("login e caminho nas ações com a chave de serviço", () => {
  it("sem login, prepararEnvioFotos e descartarEnviosFotos são recusadas antes de tocar no storage", async () => {
    requireAuth.mockRejectedValue(new Error("NEXT_REDIRECT /login"));
    await expect(prepararEnvioFotos(PRODUTO, ["webp"])).rejects.toThrow("NEXT_REDIRECT");
    await expect(descartarEnviosFotos(PRODUTO)).rejects.toThrow("NEXT_REDIRECT");
    await expect(deleteProduto("Morango Banhado")).rejects.toThrow("NEXT_REDIRECT");
    expect(storage.criarEnviosAssinados).not.toHaveBeenCalled();
    expect(storage.limparArquivosSemLinha).not.toHaveBeenCalled();
    expect(storage.apagarPastaDoProduto).not.toHaveBeenCalled();
  });

  it("recusa id de produto que não é uuid (outra pasta, raiz do bucket, '..')", async () => {
    for (const id of ["..", "", `${PRODUTO}/..`, "galeria", "../5a02782b-f4a1-4b49-90a5-38cf0f43f879"]) {
      expect(await prepararEnvioFotos(id, ["webp"])).toEqual({ error: "Formulário inválido. Recarregue a página e tente de novo." });
      await descartarEnviosFotos(id);
    }
    expect(storage.criarEnviosAssinados).not.toHaveBeenCalled();
    expect(storage.limparArquivosSemLinha).not.toHaveBeenCalled();
  });

  it("recusa formato fora da lista e mais de 9 fotos de uma vez", async () => {
    expect((await prepararEnvioFotos(PRODUTO, ["svg"])).error).toBeDefined();
    expect((await prepararEnvioFotos(PRODUTO, Array(10).fill("webp"))).error).toMatch(/Limite de 9 fotos extras/);
    expect(storage.criarEnviosAssinados).not.toHaveBeenCalled();
  });
});

describe("updateProduto com a galeria", () => {
  it("10ª foto: o servidor recusa com a mensagem do limite e não grava nada", async () => {
    const dez = [...linhas.map((l) => ({ id: l.id })), ...Array.from({ length: 7 }, () => ({ novo: crypto.randomUUID(), ext: "webp" }))];
    const r = await updateProduto("Morango Banhado", {}, form(dez));
    expect(r.error).toBe("Limite de 9 fotos extras por produto (10 com a capa). Remova uma foto para adicionar outra.");
    expect(produtosUpdates).toHaveLength(0);
    expect(rpcs).toHaveLength(0);
  });

  it("10ª foto recusada pelo gatilho do banco: mensagem clara para o admin", async () => {
    erroRpc = "Limite de 9 fotos extras por produto (10 com a capa).";
    const r = await updateProduto("Morango Banhado", {}, form([{ novo: NOVO, ext: "webp" }]));
    expect(r.error).toContain("Limite de 9 fotos extras por produto (10 com a capa). Remova uma foto para adicionar outra.");
  });

  it("grava a ordem depois de subir e descer, inclusive nas pontas (última vira primeira)", async () => {
    await updateProduto("Morango Banhado", {}, form([{ id: F3 }, { id: F1 }, { id: F2 }]));
    expect(rpcs[0].fn).toBe("salvar_produto_fotos");
    expect(rpcs[0].args).toEqual({ p_produto_id: PRODUTO, p_fotos: [{ id: F3 }, { id: F1 }, { id: F2 }] });
    expect(redirect).toHaveBeenCalledWith("/admin/produtos");
  });

  it("nada mudou na galeria: não regrava nem limpa o storage", async () => {
    await updateProduto("Morango Banhado", {}, form([{ id: F1 }, { id: F2 }, { id: F3 }]));
    expect(rpcs).toHaveLength(0);
    expect(storage.limparArquivosSemLinha).not.toHaveBeenCalled();
  });

  it("remover uma foto: a linha sai (rpc sem ela) e o arquivo é apagado (limpeza mantém só as que têm linha)", async () => {
    await updateProduto("Morango Banhado", {}, form([{ id: F1 }, { id: F3 }]));
    expect(rpcs[0].args.p_fotos).toEqual([{ id: F1 }, { id: F3 }]);
    const [id, manter] = storage.limparArquivosSemLinha.mock.calls.at(-1)!;
    expect(id).toBe(PRODUTO);
    expect([...manter]).toEqual([caminho(F1), caminho(F3, "jpg")]);
    expect([...manter]).not.toContain(caminho(F2));
  });

  it("foto nova vai para o banco com o caminho montado no servidor, dentro da pasta do produto", async () => {
    await updateProduto("Morango Banhado", {}, form([{ id: F1 }, { novo: NOVO, ext: "webp" }]));
    expect(storage.verificarArquivosNovos).toHaveBeenCalledWith(PRODUTO, [{ novo: NOVO, ext: "webp" }]);
    expect(rpcs[0].args.p_fotos).toEqual([{ id: F1 }, { caminho: caminho(NOVO) }]);
  });

  it("foto nova reprovada na conferência do servidor: nada gravado e arquivo novo apagado", async () => {
    storage.verificarArquivosNovos.mockResolvedValue("Cada foto extra precisa ter até 2 MB.");
    const r = await updateProduto("Morango Banhado", {}, form([{ novo: NOVO, ext: "webp" }]));
    expect(r.error).toBe("Cada foto extra precisa ter até 2 MB.");
    expect(produtosUpdates).toHaveLength(0);
    expect(rpcs).toHaveLength(0);
    expect([...storage.limparArquivosSemLinha.mock.calls[0][1]]).toEqual(linhas.map((l) => l.caminho));
  });

  it("falha no meio do Salvar (gravação da galeria): produto salvo, galeria como estava, arquivo novo apagado, sem redirecionar", async () => {
    erroRpc = "conexão perdida";
    const antes = [...linhas];
    const r = await updateProduto("Morango Banhado", {}, form([{ id: F1 }, { novo: NOVO, ext: "webp" }]));
    expect(r.error).toBe(
      "Produto salvo, mas as fotos extras não foram atualizadas: conexão perdida Suas alterações nas fotos continuam na tela; clique em Salvar de novo."
    );
    expect(produtosUpdates).toHaveLength(1);
    expect(linhas).toEqual(antes);
    // Limpeza mantendo só as linhas que já existiam: o arquivo novo sai.
    expect([...storage.limparArquivosSemLinha.mock.calls.at(-1)![1]]).toEqual(antes.map((l) => l.caminho));
    expect(redirect).not.toHaveBeenCalled();
  });

  it("falha na limpeza do fim do Salvar: produto e galeria salvos, sem aviso para o admin (só log)", async () => {
    storage.limparArquivosSemLinha.mockRejectedValue(new Error("storage fora do ar"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const r = await updateProduto("Morango Banhado", {}, form([{ id: F2 }, { id: F1 }]));
    expect(r).toBeUndefined();
    expect(redirect).toHaveBeenCalledWith("/admin/produtos");
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it("formulário sem o campo galeria não mexe nas fotos", async () => {
    await updateProduto("Morango Banhado", {}, form());
    expect(rpcs).toHaveLength(0);
    expect(linhas).toHaveLength(3);
  });
});

describe("createProduto com fotos extras", () => {
  it("grava o produto com o id do formulário e a galeria na ordem", async () => {
    linhas = [];
    await createProduto({}, form([{ novo: NOVO, ext: "jpg" }], { id: PRODUTO }));
    expect(rpcs[0].args).toEqual({ p_produto_id: PRODUTO, p_fotos: [{ caminho: caminho(NOVO, "jpg") }] });
  });

  it("recusa foto 'existente' no cadastro e id que não é uuid", async () => {
    expect((await createProduto({}, form([{ id: F1 }], { id: PRODUTO }))).error).toBe("Lista de fotos extras inválida.");
    expect((await createProduto({}, form([], { id: "../x" }))).error).toMatch(/Formulário inválido/);
  });
});

describe("deleteProduto", () => {
  it("apaga o produto (linhas em cascata) e depois todos os arquivos da pasta dele", async () => {
    const r = await deleteProduto("Morango Banhado");
    expect(produtosDeletes).toEqual(["Morango Banhado"]);
    expect(linhas).toEqual([]);
    expect(storage.apagarPastaDoProduto).toHaveBeenCalledWith(PRODUTO);
    expect(r).toEqual({});
  });

  it("se apagar os arquivos falhar, o produto já saiu e a listagem recebe um aviso", async () => {
    storage.apagarPastaDoProduto.mockRejectedValue(new Error("storage fora do ar"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const r = await deleteProduto("Morango Banhado");
    expect(produtosDeletes).toEqual(["Morango Banhado"]);
    expect(r.aviso).toMatch(/Produto excluído, mas algumas fotos extras não puderam ser apagadas/);
    log.mockRestore();
  });
});
