import { beforeEach, describe, expect, it, vi } from "vitest";

const PRODUTO = "8b4f3b06-7e38-4d9e-ad8e-3a6a4935e1a1";
const A = "aaaaaaaa-0000-4000-8000-000000000000";
const B = "bbbbbbbb-0000-4000-8000-000000000000";
const C = "cccccccc-0000-4000-8000-000000000000";

let naPasta: { name: string; metadata: { size: number } }[] = [];
const removidos: string[][] = [];
const listadas: string[] = [];
let falhaAoApagar = false;
// Linhas do banco vistas pela chave de serviço (conferência "outra linha usa
// o mesmo arquivo?").
let produtosNoBanco: { id: string; image_url: string | null }[] = [];
let fotosNoBanco: { id: string; caminho: string }[] = [];

vi.mock("@/lib/supabase/env", () => ({ supabaseUrl: "https://proj.supabase.co" }));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabela: string) => ({
      select: () => ({
        not: async () => ({ data: tabela === "produtos" ? produtosNoBanco.filter((p) => p.image_url !== null) : [], error: null }),
        eq: (_c: string, valor: string) => ({
          limit: async () => ({ data: fotosNoBanco.filter((f) => f.caminho === valor), error: null }),
        }),
      }),
    }),
    storage: {
      from: () => ({
        list: async (pasta: string) => {
          listadas.push(pasta);
          return { data: naPasta, error: null };
        },
        remove: async (caminhos: string[]) => {
          if (falhaAoApagar) return { error: { message: "storage fora do ar" } };
          removidos.push(caminhos);
          return { error: null };
        },
        createSignedUploadUrl: async (caminho: string) => ({ data: { token: `token-${caminho}` }, error: null }),
        getPublicUrl: (caminho: string) => ({ data: { publicUrl: `https://storage/${caminho}` } }),
      }),
    },
  }),
}));

const {
  apagarCapaAntiga,
  apagarPastaDoProduto,
  criarEnvioCapa,
  criarEnviosAssinados,
  limparArquivosSemLinha,
  limparPastaDaCapa,
  urlDaCapa,
  verificarArquivosNovos,
  verificarCapaNova,
} = await import("./storage-servidor");

beforeEach(() => {
  naPasta = [];
  removidos.length = 0;
  listadas.length = 0;
  falhaAoApagar = false;
  produtosNoBanco = [];
  fotosNoBanco = [];
  vi.unstubAllGlobals();
});

describe("storage da galeria com a chave de serviço", () => {
  it("recusa produto que não é uuid antes de tocar no storage", async () => {
    await expect(limparArquivosSemLinha("..", [])).rejects.toThrow();
    await expect(apagarPastaDoProduto(`${PRODUTO}/../outro`)).rejects.toThrow();
    await expect(criarEnviosAssinados("", ["webp"])).rejects.toThrow();
    expect(listadas).toEqual([]);
  });

  it("autoriza envio só para caminhos dentro de galeria/{id}/ escolhidos pelo servidor", async () => {
    const envios = await criarEnviosAssinados(PRODUTO, ["webp", "jpg"]);
    expect(envios).toHaveLength(2);
    for (const envio of envios) {
      expect(envio.caminho).toMatch(new RegExp(`^galeria/${PRODUTO}/[0-9a-f-]{36}\\.(webp|jpg)$`));
    }
    await expect(criarEnviosAssinados(PRODUTO, ["png" as "webp"])).rejects.toThrow();
  });

  it("apaga só os arquivos sem linha no banco (foto removida e sobras), nunca os que têm linha", async () => {
    naPasta = [
      { name: `${A}.webp`, metadata: { size: 10 } },
      { name: `${B}.webp`, metadata: { size: 10 } },
      { name: `${C}.jpg`, metadata: { size: 10 } },
      // Nome fora do padrão: ignorado, nunca apagado às cegas.
      { name: ".emptyFolderPlaceholder", metadata: { size: 0 } },
    ];
    const n = await limparArquivosSemLinha(PRODUTO, [`galeria/${PRODUTO}/${A}.webp`]);
    expect(n).toBe(2);
    expect(listadas).toEqual([`galeria/${PRODUTO}`]);
    expect(removidos).toEqual([[`galeria/${PRODUTO}/${B}.webp`, `galeria/${PRODUTO}/${C}.jpg`]]);
  });

  it("excluir produto apaga todos os arquivos da pasta dele", async () => {
    naPasta = [
      { name: `${A}.webp`, metadata: { size: 10 } },
      { name: `${B}.jpg`, metadata: { size: 10 } },
    ];
    await apagarPastaDoProduto(PRODUTO);
    expect(removidos).toEqual([[`galeria/${PRODUTO}/${A}.webp`, `galeria/${PRODUTO}/${B}.jpg`]]);
  });

  it("falha ao apagar vira erro para quem chamou decidir (a Server Action só registra no log)", async () => {
    naPasta = [{ name: `${A}.webp`, metadata: { size: 10 } }];
    falhaAoApagar = true;
    await expect(apagarPastaDoProduto(PRODUTO)).rejects.toThrow("storage fora do ar");
  });

  it("confere foto nova no servidor: existe, até 2 MB e tipo real pelos primeiros bytes", async () => {
    const webp = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    let corpo = webp;
    const fetchMock = vi.fn(async () => new Response(corpo, { status: 206 }));
    vi.stubGlobal("fetch", fetchMock);

    naPasta = [
      { name: `${A}.webp`, metadata: { size: 500_000 } },
      { name: `${B}.webp`, metadata: { size: 3 * 1024 * 1024 } },
    ];
    expect(await verificarArquivosNovos(PRODUTO, [{ novo: A, ext: "webp" }])).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(`https://storage/galeria/${PRODUTO}/${A}.webp`, expect.objectContaining({ headers: { Range: "bytes=0-15" } }));

    expect(await verificarArquivosNovos(PRODUTO, [{ novo: B, ext: "webp" }])).toBe("Cada foto extra precisa ter até 2 MB.");
    expect(await verificarArquivosNovos(PRODUTO, [{ novo: C, ext: "webp" }])).toMatch(/não chegou ao armazenamento/);

    corpo = png;
    expect(await verificarArquivosNovos(PRODUTO, [{ novo: A, ext: "webp" }])).toBe("A foto precisa ser JPG ou WebP.");
  });});

const BASE = "https://proj.supabase.co/storage/v1/object/public/Pingo%20de%20Mell";
const OUTRO = "5a02782b-f4a1-4b49-90a5-38cf0f43f879";

describe("storage da capa com a chave de serviço", () => {
  it("autoriza envio só para capa/{id}/{uuid}.webp|jpg escolhido pelo servidor", async () => {
    const envio = await criarEnvioCapa(PRODUTO, "jpg");
    expect(envio.caminho).toMatch(new RegExp(`^capa/${PRODUTO}/[0-9a-f-]{36}\.jpg$`));
    await expect(criarEnvioCapa(PRODUTO, "png" as "jpg")).rejects.toThrow();
    await expect(criarEnvioCapa("../x", "jpg")).rejects.toThrow();
  });

  it("endereço gravado em image_url é o endereço público da capa nova", () => {
    expect(urlDaCapa(PRODUTO, { novo: A, ext: "webp" })).toBe(`https://storage/capa/${PRODUTO}/${A}.webp`);
  });

  it("confere a capa nova no servidor: existe, até 2 MB e tipo real (mensagem sobre a foto escolhida)", async () => {
    const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    let corpo = jpg;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(corpo, { status: 206 })));
    naPasta = [
      { name: `${A}.jpg`, metadata: { size: 1_900_000 } },
      { name: `${B}.jpg`, metadata: { size: 2 * 1024 * 1024 + 1 } },
    ];
    expect(await verificarCapaNova(PRODUTO, { novo: A, ext: "jpg" })).toBeNull();
    expect(listadas).toEqual([`capa/${PRODUTO}`]);
    expect(await verificarCapaNova(PRODUTO, { novo: B, ext: "jpg" })).toBe("A foto de capa precisa ter até 2 MB.");
    expect(await verificarCapaNova(PRODUTO, { novo: C, ext: "jpg" })).toBe("A foto de capa não chegou ao armazenamento. Tente salvar de novo.");
    corpo = png;
    expect(await verificarCapaNova(PRODUTO, { novo: A, ext: "jpg" })).toBe(
      "Não foi possível preparar esta foto. Tente outra em JPG, PNG ou WebP."
    );
  });

  it("limpeza de capa/{id}/: fica só a capa gravada no banco", async () => {
    naPasta = [
      { name: `${A}.webp`, metadata: { size: 10 } },
      { name: `${B}.jpg`, metadata: { size: 10 } },
    ];
    expect(await limparPastaDaCapa(PRODUTO, `${BASE}/capa/${PRODUTO}/${A}.webp`)).toBe(1);
    expect(removidos).toEqual([[`capa/${PRODUTO}/${B}.jpg`]]);

    // Capa gravada na raiz (ou nenhuma): nada da pasta é capa gravada.
    removidos.length = 0;
    await limparPastaDaCapa(PRODUTO, `${BASE}/1789145949408-yesulbv5v0k.jpg`);
    expect(removidos).toEqual([[`capa/${PRODUTO}/${A}.webp`, `capa/${PRODUTO}/${B}.jpg`]]);
  });

  it("capa antiga da raiz e da pasta do próprio produto: apagada", async () => {
    expect(await apagarCapaAntiga(PRODUTO, `${BASE}/1789145949408-yesulbv5v0k.jpg`)).toBe("apagada");
    expect(await apagarCapaAntiga(PRODUTO, `${BASE}/imagem_2026-08-31_163143635.png`)).toBe("apagada");
    expect(await apagarCapaAntiga(PRODUTO, `${BASE}/capa/${PRODUTO}/${A}.webp`)).toBe("apagada");
    expect(removidos).toEqual([
      ["1789145949408-yesulbv5v0k.jpg"],
      ["imagem_2026-08-31_163143635.png"],
      [`capa/${PRODUTO}/${A}.webp`],
    ]);
    expect(await apagarCapaAntiga(PRODUTO, null)).toBe("sem-capa");
  });

  it("caminho fora do produto é recusado e nada é apagado (outro produto, '..', galeria, outro bucket ou site)", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    for (const url of [
      `${BASE}/capa/${OUTRO}/${A}.webp`,
      `${BASE}/capa/${PRODUTO}/../${OUTRO}/${A}.webp`,
      `${BASE}/..%2Fcapa%2F${OUTRO}%2F${A}.webp`,
      `${BASE}/capa/${PRODUTO}/%2E%2E/x.webp`,
      `${BASE}/galeria/${PRODUTO}/${A}.webp`,
      `${BASE}/capa/${PRODUTO}/${A}.webp?x=1`,
      `https://proj.supabase.co/storage/v1/object/public/outro-bucket/${A}.webp`,
      `https://outro.site/storage/v1/object/public/Pingo%20de%20Mell/${A}.webp`,
      `${BASE}/`,
    ]) {
      expect(await apagarCapaAntiga(PRODUTO, url), url).toBe("caminho-recusado");
    }
    expect(removidos).toEqual([]);
    log.mockRestore();
  });

  it("arquivo usado por outra linha (outro produto ou foto extra) não é apagado e vai para o log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    produtosNoBanco = [{ id: OUTRO, image_url: `${BASE}/1789145949408-yesulbv5v0k.jpg` }];
    expect(await apagarCapaAntiga(PRODUTO, `${BASE}/1789145949408-yesulbv5v0k.jpg`)).toBe("em-uso");

    produtosNoBanco = [];
    fotosNoBanco = [{ id: A, caminho: "1789145949408-yesulbv5v0k.jpg" }];
    expect(await apagarCapaAntiga(PRODUTO, `${BASE}/1789145949408-yesulbv5v0k.jpg`)).toBe("em-uso");

    expect(removidos).toEqual([]);
    expect(log).toHaveBeenCalledTimes(2);
    log.mockRestore();
  });

  it("falha ao apagar a capa antiga vira erro para quem chamou (a Server Action só registra no log)", async () => {
    falhaAoApagar = true;
    await expect(apagarCapaAntiga(PRODUTO, `${BASE}/1789145949408-yesulbv5v0k.jpg`)).rejects.toThrow("storage fora do ar");
  });
});
