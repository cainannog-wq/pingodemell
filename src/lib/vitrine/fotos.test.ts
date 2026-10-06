import { beforeEach, describe, expect, it, vi } from "vitest";
import { clienteSimulado, novoBanco, type BancoSimulado } from "@/test/banco-simulado";
import { lerFotosExtras, montarFotos } from "./fotos";

const MORANGO = "8b4f3b06-7e38-4d9e-ad8e-3a6a4935e1a1";
const TORTA = "5a02782b-f4a1-4b49-90a5-38cf0f43f879";

// Banco simulado (nada real). A Torta está inativa: o anônimo não enxerga
// as fotos dela (RLS na junção com produtos); o admin logado enxerga, e
// quem a tira da tela é a consulta do produto (buscarInterna).
const PRODUTOS = [
  { id: MORANGO, slug: "morango-banhado", nome: "Morango Banhado", image_url: "https://x/capa-morango.jpg", ativo: true },
  { id: TORTA, slug: "torta-de-limao-fatia", nome: "Torta de Limão (fatia)", image_url: null, ativo: false },
];
const FOTOS = [
  { produto_id: MORANGO, caminho: `galeria/${MORANGO}/c.webp`, posicao: 3 },
  { produto_id: MORANGO, caminho: `galeria/${MORANGO}/a.webp`, posicao: 1 },
  { produto_id: MORANGO, caminho: `galeria/${MORANGO}/b.webp`, posicao: 2 },
  { produto_id: TORTA, caminho: `galeria/${TORTA}/t.webp`, posicao: 1 },
];
let banco: BancoSimulado;

beforeEach(() => {
  banco = novoBanco({ produtos: PRODUTOS, produto_fotos: FOTOS }, "anon");
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

describe("lerFotosExtras (pelo slug, em paralelo com o produto)", () => {
  it("devolve os caminhos das extras na ordem da posição, filtrando pelo slug do produto", async () => {
    expect(await lerFotosExtras(clienteSimulado(banco) as never, "morango-banhado")).toEqual([
      `galeria/${MORANGO}/a.webp`,
      `galeria/${MORANGO}/b.webp`,
      `galeria/${MORANGO}/c.webp`,
    ]);
    expect(banco.consultas).toContain("produto_fotos.produto.slug=morango-banhado");
  });

  it("anônimo não recebe fotos de produto inativo", async () => {
    expect(await lerFotosExtras(clienteSimulado(banco) as never, "torta-de-limao-fatia")).toEqual([]);
  });

  it("falha do banco devolve null (a interna mostra só a capa)", async () => {
    banco.falhas.add("produto_fotos");
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await lerFotosExtras(clienteSimulado(banco) as never, "morango-banhado")).toBeNull();
    erro.mockRestore();
  });
});
