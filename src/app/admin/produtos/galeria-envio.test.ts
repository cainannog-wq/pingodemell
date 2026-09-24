import { describe, expect, it, vi } from "vitest";
import type { ExtensaoFoto } from "@/lib/galeria/regras";
import { enviarFotosNovas, type DependenciasEnvio, type FotoNaTela } from "./galeria-envio";

const PRODUTO = "8b4f3b06-7e38-4d9e-ad8e-3a6a4935e1a1";

function nova(chave: string): FotoNaTela {
  return {
    chave,
    tipo: "nova",
    foto: { blob: new Blob(["x"], { type: "image/webp" }), ext: "webp", largura: 10, altura: 10 },
    previewUrl: `blob:${chave}`,
  };
}

function deps(falharNo?: number) {
  const subidos: string[] = [];
  const d: DependenciasEnvio = {
    preparar: vi.fn(async (_id: string, extensoes: ExtensaoFoto[]) => ({
      envios: extensoes.map((ext, i) => ({
        novo: `00000000-0000-4000-8000-00000000000${i}`,
        ext,
        caminho: `galeria/${PRODUTO}/00000000-0000-4000-8000-00000000000${i}.${ext}`,
        token: `t${i}`,
      })),
    })),
    subir: vi.fn(async (caminho: string) => {
      if (subidos.length === falharNo) return { error: "rede caiu" };
      subidos.push(caminho);
      return {};
    }),
    descartar: vi.fn(async () => undefined),
  };
  return { d, subidos };
}

describe("enviarFotosNovas (primeira etapa do Salvar)", () => {
  it("sem foto nova não chama o servidor nem o storage, e manda a ordem da tela", async () => {
    const { d } = deps();
    const fotos: FotoNaTela[] = [
      { chave: "b", tipo: "existente", id: "bbbbbbbb-0000-4000-8000-000000000000", url: "u" },
      { chave: "a", tipo: "existente", id: "aaaaaaaa-0000-4000-8000-000000000000", url: "u" },
    ];
    const r = await enviarFotosNovas(PRODUTO, fotos, d);
    expect(d.preparar).not.toHaveBeenCalled();
    expect(d.subir).not.toHaveBeenCalled();
    expect(r).toEqual({
      ok: true,
      itens: [{ id: "bbbbbbbb-0000-4000-8000-000000000000" }, { id: "aaaaaaaa-0000-4000-8000-000000000000" }],
    });
  });

  it("sobe as novas e intercala com as existentes na ordem da tela, sem mandar caminho pronto", async () => {
    const { d, subidos } = deps();
    const fotos: FotoNaTela[] = [nova("n1"), { chave: "e", tipo: "existente", id: "eeeeeeee-0000-4000-8000-000000000000", url: "u" }, nova("n2")];
    const r = await enviarFotosNovas(PRODUTO, fotos, d);
    expect(subidos).toHaveLength(2);
    expect(r).toEqual({
      ok: true,
      itens: [
        { novo: "00000000-0000-4000-8000-000000000000", ext: "webp" },
        { id: "eeeeeeee-0000-4000-8000-000000000000" },
        { novo: "00000000-0000-4000-8000-000000000001", ext: "webp" },
      ],
    });
    expect(JSON.stringify(r)).not.toContain("galeria/");
  });

  it("falha no meio do envio: pede para apagar o que já subiu e não segue para o formulário", async () => {
    const { d } = deps(1);
    const r = await enviarFotosNovas(PRODUTO, [nova("n1"), nova("n2"), nova("n3")], d);
    expect(r).toEqual({ ok: false, erro: "Não foi possível enviar a foto extra 2. Nada foi salvo; tente de novo." });
    expect(d.descartar).toHaveBeenCalledWith(PRODUTO);
    expect(d.subir).toHaveBeenCalledTimes(2);
  });

  it("servidor recusando o preparo (ex.: acima do limite): nada sobe", async () => {
    const d: DependenciasEnvio = {
      preparar: vi.fn(async () => ({ error: "Limite de 9 fotos extras por produto (10 com a capa). Remova uma foto para adicionar outra." })),
      subir: vi.fn(),
      descartar: vi.fn(),
    };
    const r = await enviarFotosNovas(PRODUTO, [nova("n1")], d);
    expect(r.ok).toBe(false);
    expect(d.subir).not.toHaveBeenCalled();
  });
});
