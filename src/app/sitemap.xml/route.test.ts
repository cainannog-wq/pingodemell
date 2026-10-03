import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SITE_URL } from "@/lib/site/url";
import type { ProdutoVitrine } from "@/lib/vitrine/mais-pedidos";
import { clienteSimulado, novoBanco, type BancoSimulado } from "@/test/banco-simulado";

// /sitemap.xml (PR fase4/seo-metadados). Banco simulado, papel anônimo;
// nenhuma consulta real.

let banco: BancoSimulado;
vi.mock("@/lib/supabase/publico", () => ({ createPublicClient: vi.fn(() => clienteSimulado(banco)) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

let seq = 0;
function produto(parcial: Partial<ProdutoVitrine>): ProdutoVitrine {
  seq += 1;
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    slug: `produto-${seq}`,
    nome: `Produto ${seq}`,
    descricao: null,
    preco: 10,
    image_url: null,
    Categoria: "Doces",
    tipo: "normal",
    unidade_venda: null,
    pedido_minimo: 1,
    step_quantidade: "livre",
    ativo: true,
    destaque: false,
    atualizado_em: "2026-09-23T14:29:18.070Z",
    ...parcial,
  };
}

const MORANGO = produto({ nome: "Morango Banhado", slug: "morango-banhado" });
const INATIVO = produto({ nome: "Torta", slug: "torta", ativo: false, Categoria: "Bebidas" });
const CENTO_VAZIO = produto({ nome: "Cento Vazio", slug: "cento-vazio", tipo: "cento", Categoria: "Salgados" });
const BOLO = produto({ nome: "Bolo", slug: "bolo", tipo: "bolo", Categoria: "Bolos" });

async function getCom(indexavel: boolean) {
  vi.resetModules();
  vi.doMock("@/lib/site/indexacao", async (original) => ({
    ...(await original<typeof import("@/lib/site/indexacao")>()),
    SITE_INDEXAVEL: indexavel,
  }));
  const { GET } = await import("./route");
  return GET();
}

beforeEach(() => {
  banco = novoBanco({
    produtos: [MORANGO, INATIVO, CENTO_VAZIO, BOLO],
    produto_cento_itens: [],
    recheios: [{ id: "r1", nome: "Brigadeiro", vale_bolo: true, vale_bento: false, preco_kg: 70, grupo: "chocolate", ativo: true }],
  });
});
afterEach(() => {
  vi.doUnmock("@/lib/site/indexacao");
});

describe("/sitemap.xml", () => {
  it("com a constante como está (false): 404, sem consultar o banco", async () => {
    const { SITE_INDEXAVEL } = await import("@/lib/site/indexacao");
    expect(SITE_INDEXAVEL).toBe(false);
    vi.resetModules();
    const { GET } = await import("./route");
    const r = await GET();
    expect(r.status).toBe(404);
    expect(banco.consultas).toEqual([]);
  });

  it("com SITE_INDEXAVEL true: 200, application/xml, XML com as URLs esperadas", async () => {
    const r = await getCom(true);
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Type")).toBe("application/xml");
    const xml = await r.text();
    const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
    const BASE = SITE_URL;
    expect(locs).toEqual([
      `${BASE}/`,
      `${BASE}/produtos`,
      `${BASE}/quem-somos`,
      `${BASE}/produtos?categoria=bolos`,
      `${BASE}/produtos?categoria=doces`,
      `${BASE}/produtos/bolo`,
      `${BASE}/produtos/morango-banhado`,
    ]);
    // Inativo e Cento sem sabor ficam fora, com as categorias deles (Bebidas, Salgados).
    expect(xml).not.toContain("torta");
    expect(xml).not.toContain("cento-vazio");
    expect(xml).not.toContain("categoria=salgados");
    expect(xml).not.toContain("categoria=bebidas");
    expect(xml).not.toContain("categoria=kits");
    // O filtro de ativo vai na consulta.
    expect(banco.consultas).toContain("produtos.ativo=true");
  });

  it("Bolo sem recheio ativo de Bolo fica fora, com a categoria", async () => {
    banco.tabelas.recheios = [];
    const xml = await (await getCom(true)).text();
    expect(xml).not.toContain("/produtos/bolo");
    expect(xml).not.toContain("categoria=bolos");
  });

  it("falha do banco: 503, sem sitemap pela metade", async () => {
    banco.falhas.add("produtos");
    expect((await getCom(true)).status).toBe(503);
  });
});
