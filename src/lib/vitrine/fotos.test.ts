import { beforeEach, describe, expect, it, vi } from "vitest";
import { buscarFotosProduto, montarFotos } from "./fotos";

const MORANGO = "8b4f3b06-7e38-4d9e-ad8e-3a6a4935e1a1";
const TORTA = "5a02782b-f4a1-4b49-90a5-38cf0f43f879";

// "Banco" falso que aplica os filtros da consulta, simulando a sessão de um
// admin LOGADO navegando no site: ele enxerga produto inativo e as fotos
// dele. Só o filtro de ativo escrito na própria consulta esconde a Torta.
const PRODUTOS = [
  { id: MORANGO, nome: "Morango Banhado", image_url: "https://x/capa-morango.jpg", ativo: true },
  { id: TORTA, nome: "Torta de Limão (fatia)", image_url: null, ativo: false },
];
const FOTOS = [
  { produto_id: MORANGO, caminho: `galeria/${MORANGO}/c.webp`, posicao: 3 },
  { produto_id: MORANGO, caminho: `galeria/${MORANGO}/a.webp`, posicao: 1 },
  { produto_id: MORANGO, caminho: `galeria/${MORANGO}/b.webp`, posicao: 2 },
  { produto_id: TORTA, caminho: `galeria/${TORTA}/t.webp`, posicao: 1 },
];
const consultas: string[] = [];

function tabela(nome: string, linhas: Record<string, unknown>[]) {
  const filtros: [string, unknown][] = [];
  let ordem: string | null = null;
  const filtradas = () => {
    const r = linhas.filter((l) => filtros.every(([c, v]) => l[c] === v));
    return ordem ? [...r].sort((x, y) => (x[ordem!] as number) - (y[ordem!] as number)) : r;
  };
  const q = {
    select: () => q,
    eq: (c: string, v: unknown) => {
      filtros.push([c, v]);
      consultas.push(`${nome}.${c}=${v}`);
      return q;
    },
    order: (c: string) => {
      ordem = c;
      return q;
    },
    maybeSingle: async () => ({ data: filtradas()[0] ?? null, error: null }),
    then: (ok: (r: { data: unknown; error: null }) => void) => ok({ data: filtradas(), error: null }),
  };
  return q;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (nome: string) => tabela(nome, nome === "produtos" ? PRODUTOS : FOTOS),
    storage: { from: () => ({ getPublicUrl: (c: string) => ({ data: { publicUrl: `https://storage/${c}` } }) }) },
  })),
}));

beforeEach(() => {
  consultas.length = 0;
});

describe("montarFotos", () => {
  it("capa primeiro, extras na ordem recebida, texto alternativo contando a capa", () => {
    const fotos = montarFotos({ nome: "Bolo", image_url: "capa.jpg" }, ["x", "y"], (c) => `url/${c}`);
    expect(fotos).toEqual([
      { url: "capa.jpg", alt: "Bolo, foto 1 de 3" },
      { url: "url/x", alt: "Bolo, foto 2 de 3" },
      { url: "url/y", alt: "Bolo, foto 3 de 3" },
    ]);
  });

  it("sem capa, a primeira extra é a foto 1", () => {
    expect(montarFotos({ nome: "Torta", image_url: null }, ["x"], (c) => c)).toEqual([{ url: "x", alt: "Torta, foto 1 de 1" }]);
  });
});

describe("buscarFotosProduto (leitura pública)", () => {
  it("devolve a capa seguida das fotos extras na ordem da posição", async () => {
    const fotos = await buscarFotosProduto(MORANGO);
    expect(fotos).toEqual([
      { url: "https://x/capa-morango.jpg", alt: "Morango Banhado, foto 1 de 4" },
      { url: `https://storage/galeria/${MORANGO}/a.webp`, alt: "Morango Banhado, foto 2 de 4" },
      { url: `https://storage/galeria/${MORANGO}/b.webp`, alt: "Morango Banhado, foto 3 de 4" },
      { url: `https://storage/galeria/${MORANGO}/c.webp`, alt: "Morango Banhado, foto 4 de 4" },
    ]);
  });

  it("produto inativo não devolve nada, mesmo com sessão logada que enxerga as fotos dele", async () => {
    expect(await buscarFotosProduto(TORTA)).toEqual([]);
    expect(consultas).toContain("produtos.ativo=true");
    // Nem chega a pedir as fotos extras.
    expect(consultas.some((c) => c.startsWith("produto_fotos."))).toBe(false);
  });
});
