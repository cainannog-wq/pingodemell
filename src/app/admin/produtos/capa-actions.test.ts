import { beforeEach, describe, expect, it, vi } from "vitest";

// Server Actions de produto na parte da foto de capa. O banco é simulado
// (uma linha de produto com image_url); as operações de storage com a chave
// de serviço são espiadas, para provar a ordem: capa antiga só é apagada
// depois de a troca estar gravada, e nunca quando a troca falha.

const PRODUTO = "197d31af-803d-4af9-b6d4-66fd013dff4d";
const NOVO = "99999999-0000-4000-8000-000000000000";
const BASE = "https://proj.supabase.co/storage/v1/object/public/Pingo%20de%20Mell";
const CAPA_ANTIGA = `${BASE}/1789162576907-de960btf3eq.jpeg`;
const CAPA_NOVA = `${BASE}/capa/${PRODUTO}/${NOVO}.webp`;

type Produto = { id: string; nome: string; image_url: string | null };
let produto: Produto | null;
let erroUpdate: string | null = null;
let erroInsert: string | null = null;
let erroSubitens: string | null = null;
const eventos: string[] = [];
const updates: Record<string, unknown>[] = [];
const inserts: Record<string, unknown>[] = [];

const requireAuth = vi.fn();
const redirect = vi.fn();
const storage = {
  verificarArquivosNovos: vi.fn(async (): Promise<string | null> => null),
  limparArquivosSemLinha: vi.fn(async () => 0),
  apagarPastaDoProduto: vi.fn(async () => 0),
  criarEnviosAssinados: vi.fn(async () => []),
  criarEnvioCapa: vi.fn(async (id: string, ext: string) => ({ novo: NOVO, ext, caminho: `capa/${id}/${NOVO}.${ext}`, token: "t" })),
  verificarCapaNova: vi.fn(async (): Promise<string | null> => null),
  urlDaCapa: vi.fn((id: string, capa: { novo: string; ext: string }) => `${BASE}/capa/${id}/${capa.novo}.${capa.ext}`),
  limparPastaDaCapa: vi.fn(async (_id: string, url: string | null) => {
    eventos.push(`limpar capa/ mantendo ${url}`);
    return 0;
  }),
  apagarCapaAntiga: vi.fn(async (_id: string, url: string | null) => {
    eventos.push(`apagar antiga ${url}`);
    return "apagada" as const;
  }),
};

vi.mock("@/lib/supabase/dal", () => ({ requireAuth: () => requireAuth() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }));
vi.mock("@/lib/galeria/storage-servidor", () => ({
  verificarArquivosNovos: () => storage.verificarArquivosNovos(),
  limparArquivosSemLinha: () => storage.limparArquivosSemLinha(),
  apagarPastaDoProduto: () => storage.apagarPastaDoProduto(),
  criarEnviosAssinados: () => storage.criarEnviosAssinados(),
  criarEnvioCapa: (id: string, ext: string) => storage.criarEnvioCapa(id, ext),
  verificarCapaNova: () => storage.verificarCapaNova(),
  urlDaCapa: (id: string, capa: { novo: string; ext: string }) => storage.urlDaCapa(id, capa),
  limparPastaDaCapa: (id: string, url: string | null) => storage.limparPastaDaCapa(id, url),
  apagarCapaAntiga: (id: string, url: string | null) => storage.apagarCapaAntiga(id, url),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (tabela: string) => {
      if (tabela === "produtos") {
        return {
          select: (colunas: string) => ({
            eq: (coluna: string, valor: string) => ({
              maybeSingle: async () => {
                const achou = produto && (produto as Record<string, unknown>)[coluna] === valor ? produto : null;
                if (colunas === "nome") return { data: null, error: null }; // nome repetido: nenhum
                if (!achou) return { data: null, error: null };
                if (colunas === "image_url") return { data: { image_url: achou.image_url }, error: null };
                return { data: { id: achou.id, image_url: achou.image_url }, error: null };
              },
            }),
          }),
          insert: async (payload: Record<string, unknown>) => {
            eventos.push("insert produto");
            inserts.push(payload);
            if (erroInsert) return { error: { message: erroInsert } };
            produto = { id: payload.id as string, nome: payload.nome as string, image_url: (payload.image_url as string) ?? null };
            return { error: null };
          },
          update: (payload: Record<string, unknown>) => ({
            eq: async () => {
              eventos.push("update produto");
              updates.push(payload);
              if (erroUpdate) return { error: { message: erroUpdate } };
              if (produto && "image_url" in payload) produto.image_url = payload.image_url as string;
              return { error: null };
            },
          }),
          delete: () => ({
            eq: async () => {
              eventos.push("delete produto");
              produto = null;
              return { error: null };
            },
          }),
        };
      }
      if (tabela === "produto_fotos") {
        return { select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }) };
      }
      if (tabela === "produto_cento_itens") {
        return {
          delete: () => ({ eq: async () => ({ error: erroSubitens ? { message: erroSubitens } : null }) }),
          insert: async () => ({ error: null }),
        };
      }
      throw new Error(`tabela inesperada: ${tabela}`);
    },
    rpc: async () => ({ error: null }),
  })),
}));

const { createProduto, updateProduto, deleteProduto, prepararEnvioFotos, descartarEnviosFotos } = await import("./actions");

const CAMPOS = {
  nome: "Brigadeiro Gourmet",
  preco: "5,00",
  pedido_minimo: "1",
  prazo_producao_dias: "1",
  step_quantidade: "livre",
  tipo: "normal",
};

function form(capa?: unknown, extra: Record<string, string> = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ ...CAMPOS, ...extra })) fd.set(k, v);
  fd.set("galeria", "[]");
  if (capa !== undefined) fd.set("capa", typeof capa === "string" ? capa : JSON.stringify(capa));
  return fd;
}

beforeEach(() => {
  produto = { id: PRODUTO, nome: "Brigadeiro Gourmet", image_url: CAPA_ANTIGA };
  erroUpdate = null;
  erroInsert = null;
  erroSubitens = null;
  eventos.length = 0;
  updates.length = 0;
  inserts.length = 0;
  requireAuth.mockReset().mockResolvedValue({ id: "admin" });
  redirect.mockReset();
  for (const fn of Object.values(storage)) fn.mockClear();
  storage.verificarCapaNova.mockResolvedValue(null);
  storage.apagarCapaAntiga.mockImplementation(async (_id, url) => {
    eventos.push(`apagar antiga ${url}`);
    return "apagada";
  });
  storage.limparPastaDaCapa.mockImplementation(async (_id, url) => {
    eventos.push(`limpar capa/ mantendo ${url}`);
    return 0;
  });
});

describe("updateProduto trocando a capa", () => {
  it("troca salva: grava a nova e só depois apaga a antiga (endereço lido do banco) e limpa a pasta", async () => {
    await updateProduto("Brigadeiro Gourmet", {}, form({ novo: NOVO, ext: "webp" }));
    expect(updates[0].image_url).toBe(CAPA_NOVA);
    expect(eventos).toEqual(["update produto", `apagar antiga ${CAPA_ANTIGA}`, `limpar capa/ mantendo ${CAPA_NOVA}`]);
    expect(storage.apagarCapaAntiga).toHaveBeenCalledWith(PRODUTO, CAPA_ANTIGA);
    expect(redirect).toHaveBeenCalledWith("/admin/produtos");
  });

  it("gravação do produto falha: a antiga continua, nada é apagado dela e a nova sai (limpeza mantendo a antiga)", async () => {
    erroUpdate = "conexão perdida";
    const r = await updateProduto("Brigadeiro Gourmet", {}, form({ novo: NOVO, ext: "webp" }));
    expect(r.error).toBe("Não foi possível salvar o produto: conexão perdida");
    expect(produto!.image_url).toBe(CAPA_ANTIGA);
    expect(storage.apagarCapaAntiga).not.toHaveBeenCalled();
    expect(eventos).toEqual(["update produto", `limpar capa/ mantendo ${CAPA_ANTIGA}`]);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("arquivo recusado pelo servidor depois do envio (acima de 2 MB ou tipo errado): nada gravado, antiga fica, nova sai", async () => {
    for (const mensagem of ["A foto de capa precisa ter até 2 MB.", "Não foi possível preparar esta foto. Tente outra em JPG, PNG ou WebP."]) {
      eventos.length = 0;
      storage.verificarCapaNova.mockResolvedValueOnce(mensagem);
      const r = await updateProduto("Brigadeiro Gourmet", {}, form({ novo: NOVO, ext: "webp" }));
      expect(r.error).toBe(mensagem);
      expect(eventos).toEqual([`limpar capa/ mantendo ${CAPA_ANTIGA}`]);
    }
    expect(updates).toHaveLength(0);
    expect(storage.apagarCapaAntiga).not.toHaveBeenCalled();
  });

  it("subitens falham depois da troca gravada: a troca vale e a antiga sai mesmo assim", async () => {
    erroSubitens = "rede";
    const r = await updateProduto("Brigadeiro Gourmet", {}, form({ novo: NOVO, ext: "webp" }));
    expect(r.error).toMatch(/Produto salvo, mas não foi possível atualizar a lista de subitens/);
    expect(storage.apagarCapaAntiga).toHaveBeenCalledWith(PRODUTO, CAPA_ANTIGA);
  });

  it("falha ao apagar a antiga ou ao limpar a pasta: produto salvo, sem aviso para o admin (só log)", async () => {
    storage.apagarCapaAntiga.mockRejectedValueOnce(new Error("storage fora do ar"));
    storage.limparPastaDaCapa.mockRejectedValueOnce(new Error("storage fora do ar"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const r = await updateProduto("Brigadeiro Gourmet", {}, form({ novo: NOVO, ext: "webp" }));
    expect(r).toBeUndefined();
    expect(redirect).toHaveBeenCalledWith("/admin/produtos");
    expect(log).toHaveBeenCalledTimes(2);
    log.mockRestore();
  });

  it("sem capa nova no formulário: não mexe em image_url nem no storage da capa", async () => {
    await updateProduto("Brigadeiro Gourmet", {}, form());
    expect(updates[0]).not.toHaveProperty("image_url");
    expect(storage.verificarCapaNova).not.toHaveBeenCalled();
    expect(storage.apagarCapaAntiga).not.toHaveBeenCalled();
    expect(storage.limparPastaDaCapa).not.toHaveBeenCalled();
  });

  it("caminho vindo do navegador é recusado: o campo só aceita id do arquivo + extensão", async () => {
    for (const capa of [
      { caminho: "1789145949408-yesulbv5v0k.jpg" },
      { novo: "../1789145949408-yesulbv5v0k", ext: "jpg" },
      { novo: `capa/${PRODUTO}/${NOVO}`, ext: "webp" },
      { novo: NOVO, ext: "png" },
      "não é json",
    ]) {
      const r = await updateProduto("Brigadeiro Gourmet", {}, form(capa));
      expect(r.error, JSON.stringify(capa)).toBe("Formulário inválido. Recarregue a página e tente de novo.");
    }
    expect(updates).toHaveLength(0);
    expect(storage.apagarCapaAntiga).not.toHaveBeenCalled();
    // Só a limpeza (que mantém a capa gravada) roda; nada apaga a antiga.
    for (const [, url] of storage.limparPastaDaCapa.mock.calls) expect(url).toBe(CAPA_ANTIGA);
  });
});

describe("createProduto com capa", () => {
  const NOVO_PRODUTO = "f3888633-c9d7-4eeb-83a9-396d48eb7fe6";

  it("grava o produto já com a capa nova e limpa a pasta mantendo só ela", async () => {
    produto = null;
    await createProduto({}, form({ novo: NOVO, ext: "jpg" }, { id: NOVO_PRODUTO }));
    expect(inserts[0].image_url).toBe(`${BASE}/capa/${NOVO_PRODUTO}/${NOVO}.jpg`);
    expect(eventos).toEqual(["insert produto", `limpar capa/ mantendo ${BASE}/capa/${NOVO_PRODUTO}/${NOVO}.jpg`]);
    expect(storage.apagarCapaAntiga).not.toHaveBeenCalled();
  });

  it("gravação do cadastro falha: a capa que já subiu é apagada (nenhuma capa gravada para manter)", async () => {
    produto = null;
    erroInsert = "duplicado";
    const r = await createProduto({}, form({ novo: NOVO, ext: "jpg" }, { id: NOVO_PRODUTO }));
    expect(r.error).toMatch(/Não foi possível salvar o produto/);
    expect(eventos).toEqual(["insert produto", "limpar capa/ mantendo null"]);
  });
});

describe("deleteProduto com capa", () => {
  it("apaga o produto e depois fotos extras, a capa (endereço lido do banco) e a pasta capa/{id}/", async () => {
    const r = await deleteProduto("Brigadeiro Gourmet");
    expect(eventos).toEqual(["delete produto", `apagar antiga ${CAPA_ANTIGA}`, "limpar capa/ mantendo null"]);
    expect(storage.apagarPastaDoProduto).toHaveBeenCalled();
    expect(r).toEqual({});
  });

  it("se apagar a capa falhar, o produto já saiu, as outras etapas rodam e a listagem recebe um aviso", async () => {
    storage.apagarCapaAntiga.mockRejectedValueOnce(new Error("storage fora do ar"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const r = await deleteProduto("Brigadeiro Gourmet");
    expect(produto).toBeNull();
    expect(storage.limparPastaDaCapa).toHaveBeenCalledWith(PRODUTO, null);
    expect(r.aviso).toBe("Produto excluído, mas algumas fotos não puderam ser apagadas do armazenamento. Avise o suporte.");
    log.mockRestore();
  });
});

describe("login e preparo do envio da capa", () => {
  it("sem login, nenhuma ação toca no storage nem no banco", async () => {
    requireAuth.mockRejectedValue(new Error("NEXT_REDIRECT /login"));
    await expect(prepararEnvioFotos(PRODUTO, [], "webp")).rejects.toThrow("NEXT_REDIRECT");
    await expect(descartarEnviosFotos(PRODUTO)).rejects.toThrow("NEXT_REDIRECT");
    await expect(updateProduto("Brigadeiro Gourmet", {}, form({ novo: NOVO, ext: "webp" }))).rejects.toThrow("NEXT_REDIRECT");
    await expect(createProduto({}, form({ novo: NOVO, ext: "webp" }, { id: PRODUTO }))).rejects.toThrow("NEXT_REDIRECT");
    await expect(deleteProduto("Brigadeiro Gourmet")).rejects.toThrow("NEXT_REDIRECT");
    for (const fn of Object.values(storage)) expect(fn).not.toHaveBeenCalled();
    expect(eventos).toEqual([]);
  });

  it("autoriza a capa junto com as extras; extensão fora da lista é recusada", async () => {
    const r = await prepararEnvioFotos(PRODUTO, [], "webp");
    expect(r.capa).toEqual({ novo: NOVO, ext: "webp", caminho: `capa/${PRODUTO}/${NOVO}.webp`, token: "t" });
    expect(storage.criarEnvioCapa).toHaveBeenCalledWith(PRODUTO, "webp");

    storage.criarEnvioCapa.mockClear();
    for (const ext of ["png", "../x", "svg"]) {
      expect((await prepararEnvioFotos(PRODUTO, [], ext)).error).toBeDefined();
    }
    expect(storage.criarEnvioCapa).not.toHaveBeenCalled();
  });

  it("descartar depois de um envio que falhou limpa as duas pastas, mantendo o que está gravado", async () => {
    await descartarEnviosFotos(PRODUTO);
    expect(storage.limparArquivosSemLinha).toHaveBeenCalled();
    expect(storage.limparPastaDaCapa).toHaveBeenCalledWith(PRODUTO, CAPA_ANTIGA);
  });
});

// Slug (URL amigável): gerado e travado no banco. O admin nunca envia slug,
// nem quando o formulário chega com um campo "slug" forjado.
describe("slug: o admin nunca envia", () => {
  it("cadastro e edição com renomeação gravam sem a coluna slug (os toggles de ativo e destaque: actions.test.ts)", async () => {
    produto = null;
    await createProduto({}, form(undefined, { id: "f3888633-c9d7-4eeb-83a9-396d48eb7fe6", slug: "forjado" }));
    produto = { id: PRODUTO, nome: "Brigadeiro Gourmet", image_url: CAPA_ANTIGA };
    await updateProduto("Brigadeiro Gourmet", {}, form(undefined, { nome: "Brigadeiro Gourmet 2", slug: "forjado" }));
    expect(inserts).toHaveLength(1);
    expect(updates).toHaveLength(1);
    for (const payload of [...inserts, ...updates]) expect(payload).not.toHaveProperty("slug");
    expect(updates[0].nome).toBe("Brigadeiro Gourmet 2");
  });
});
