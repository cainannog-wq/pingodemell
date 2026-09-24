import { beforeEach, describe, expect, it, vi } from "vitest";

const PRODUTO = "8b4f3b06-7e38-4d9e-ad8e-3a6a4935e1a1";
const A = "aaaaaaaa-0000-4000-8000-000000000000";
const B = "bbbbbbbb-0000-4000-8000-000000000000";
const C = "cccccccc-0000-4000-8000-000000000000";

let naPasta: { name: string; metadata: { size: number } }[] = [];
const removidos: string[][] = [];
const listadas: string[] = [];
let falhaAoApagar = false;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
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

const { apagarPastaDoProduto, criarEnviosAssinados, limparArquivosSemLinha, verificarArquivosNovos } = await import(
  "./storage-servidor"
);

beforeEach(() => {
  naPasta = [];
  removidos.length = 0;
  listadas.length = 0;
  falhaAoApagar = false;
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
  });
});
