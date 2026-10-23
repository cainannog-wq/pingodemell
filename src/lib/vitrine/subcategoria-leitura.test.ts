import { beforeEach, describe, expect, it, vi } from "vitest";
import { clienteSimulado, novoBanco, type BancoSimulado } from "@/test/banco-simulado";
import type { ProdutoVitrine } from "./mais-pedidos";

// Leitura das subcategorias na Lista (PR 5, commit 2): cache da vitrine de
// verdade (guarda por chave e argumentos), cliente sem sessão simulado.
// Nenhum teste lê o banco.

const guardado = new Map<string, unknown>();
vi.mock("next/cache", () => ({
  unstable_cache:
    (leitura: (...a: unknown[]) => Promise<unknown>, chave: string[], opcoes: { tags?: string[]; revalidate?: number }) =>
    async (...args: unknown[]) => {
      const k = JSON.stringify([chave, args]);
      if (!guardado.has(k)) {
        guardado.set(k, await leitura(...args));
        etiquetas.set(k, opcoes);
      }
      return guardado.get(k);
    },
  updateTag: vi.fn(),
}));
const etiquetas = new Map<string, { tags?: string[]; revalidate?: number }>();

let banco: BancoSimulado;
vi.mock("@/lib/supabase/publico", () => ({ createPublicClient: vi.fn(() => clienteSimulado(banco)) }));

let seq = 0;
function produto(parcial: Partial<ProdutoVitrine>): ProdutoVitrine {
  seq += 1;
  return {
    id: `id-${seq}`,
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
    subcategoria_id: null,
    ...parcial,
  };
}

const FINOS = { id: "s-finos", categoria: "Doces", nome: "Finos", slug: "finos", ordem: 10, ativo: true };
const GOURMET = { id: "s-gourmet", categoria: "Doces", nome: "Gourmet", slug: "gourmet", ordem: 20, ativo: true };
const INATIVA = { id: "s-inativa", categoria: "Doces", nome: "Inativa", slug: "inativa", ordem: 30, ativo: false };

const TABELAS = () => ({
  produtos: [
    produto({ nome: "Éclair", subcategoria_id: FINOS.id }),
    produto({ nome: "Brigadeiro", subcategoria_id: GOURMET.id }),
    produto({ nome: "Bolo Comum", Categoria: "Bolos" }),
  ],
  subcategorias: [FINOS, GOURMET, INATIVA],
  recheios: [],
});

const base = { categoria: null, busca: "", ordem: "recomendados", pagina: 1 } as const;

beforeEach(() => {
  guardado.clear();
  etiquetas.clear();
  banco = novoBanco(TABELAS(), "anon");
});

describe("leitura das subcategorias", () => {
  it("a Lista traz as subcategorias ativas e o subcategoria_id dos produtos", async () => {
    const { buscarDadosDaLista } = await import("./buscar");
    const dados = await buscarDadosDaLista();
    expect(dados!.subcategorias.map((s) => s.slug)).toEqual(["finos", "gourmet"]);
    expect(dados!.produtos.find((p) => p.nome === "Éclair")!.subcategoria_id).toBe(FINOS.id);
  });

  it("pede só ativas na consulta e filtra de novo no código (mesmo se o banco devolver inativa)", async () => {
    const { buscarDadosDaLista } = await import("./buscar");
    expect(banco.consultas).toEqual([]);
    banco.papel = "admin"; // o admin logado lê inativas mesmo pedindo ativas
    const dados = await buscarDadosDaLista();
    expect(banco.consultas).toContain("subcategorias.ativo=true");
    expect(dados!.subcategorias.map((s) => s.slug)).not.toContain("inativa");
  });

  it("buscarLista entrega os chips e aplica o filtro", async () => {
    const { buscarLista } = await import("./buscar");
    const r = await buscarLista({ ...base, categoria: "Doces", subcategoria: "finos" });
    expect(r!.chips.map((c) => c.slug)).toEqual(["finos", "gourmet"]);
    expect(r!.itens.map((i) => i.produto.nome)).toEqual(["Éclair"]);
  });

  it("a Home e as demais leituras não consultam as subcategorias", async () => {
    const { buscarMaisPedidos } = await import("./buscar");
    await buscarMaisPedidos();
    expect(banco.consultas.some((c) => c.startsWith("subcategorias."))).toBe(false);
  });

  it("falha da leitura não derruba a Lista: sem chips e sem filtro, erro só no log", async () => {
    banco.falhas.add("subcategorias");
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    const { buscarLista } = await import("./buscar");
    const r = await buscarLista({ ...base, categoria: "Doces", subcategoria: "finos" });
    expect(r).not.toBeNull();
    expect(r!.chips).toEqual([]);
    expect(r!.subcategoriaAtiva).toBeNull();
    expect(r!.itens.map((i) => i.produto.nome).sort()).toEqual(["Brigadeiro", "Éclair"]);
    expect(erro).toHaveBeenCalledWith("Falha ao buscar as subcategorias:", expect.stringContaining("subcategorias"));
    erro.mockRestore();
  });

  it("a falha não é guardada no cache: a leitura seguinte tenta de novo", async () => {
    banco.falhas.add("subcategorias");
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    const { buscarLista } = await import("./buscar");
    await buscarLista({ ...base, categoria: "Doces" });
    expect([...guardado.keys()].some((k) => k.includes("vitrine-subcategorias"))).toBe(false);
    banco.falhas.clear();
    const r = await buscarLista({ ...base, categoria: "Doces" });
    expect(r!.chips.map((c) => c.slug)).toEqual(["finos", "gourmet"]);
    erro.mockRestore();
  });

  it("falha dos produtos continua devolvendo null (aviso de falha da página)", async () => {
    banco.falhas.add("produtos");
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    const { buscarLista } = await import("./buscar");
    expect(await buscarLista(base)).toBeNull();
    erro.mockRestore();
  });
});

describe("cache da Lista", () => {
  const URLS = [
    base,
    { ...base, categoria: "Doces" },
    { ...base, categoria: "Doces", subcategoria: "finos" },
    { ...base, categoria: "Doces", subcategoria: "gourmet", busca: "bri", ordem: "a-z", pagina: 3 },
    { ...base, categoria: "Bolos", subcategoria: "finos" },
  ] as const;

  it("a chave não depende da URL: qualquer combinação usa as mesmas entradas, com a etiqueta e o prazo da vitrine", async () => {
    const { buscarLista } = await import("./buscar");
    await buscarLista(URLS[0]);
    const chaves = [...guardado.keys()].sort();
    for (const url of URLS) await buscarLista(url);
    expect([...guardado.keys()].sort()).toEqual(chaves);
    expect(chaves.some((k) => k.includes("vitrine-subcategorias"))).toBe(true);
    for (const k of chaves) expect(etiquetas.get(k)).toMatchObject({ tags: ["vitrine"], revalidate: 86400 });
  });

  it("cada URL recebe a sua lista, nunca a de outra URL guardada antes", async () => {
    const { buscarLista } = await import("./buscar");
    const nomes = async (p: Parameters<typeof buscarLista>[0]) => (await buscarLista(p))!.itens.map((i) => i.produto.nome);
    expect(await nomes(URLS[2])).toEqual(["Éclair"]);
    // Categoria com filtro, sem o parâmetro: abre na primeira subcategoria.
    expect(await nomes(URLS[1])).toEqual(["Éclair"]);
    expect(await nomes({ ...URLS[1], subcategoria: "todos" })).toEqual(["Brigadeiro", "Éclair"]);
    expect(await nomes(URLS[3])).toEqual(["Brigadeiro"]); // página 3 fora do intervalo vai para a última
    expect(await nomes(URLS[2])).toEqual(["Éclair"]);
    expect(await nomes(URLS[4])).toEqual(["Bolo Comum"]);
  });
});
