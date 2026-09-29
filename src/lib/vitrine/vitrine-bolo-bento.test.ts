import { beforeEach, describe, expect, it, vi } from "vitest";
import { categoriaParaParametro } from "@/lib/site/rotas";
import { clienteSimulado, novoBanco, type BancoSimulado } from "@/test/banco-simulado";
import { buscarInterna, buscarLista, buscarMaisPedidos } from "./buscar";
import { categoriaDoParametro } from "./lista";
import { formatarPrecoVitrine, partesPrecoVitrine, type ProdutoVitrine } from "./mais-pedidos";
import { textoMinimo, textoMinimoCurto } from "./minimo";

// Home, Lista e interna com Bolo, Bento Cake e Smash Cake, contra o banco
// simulado (nada real): disponibilidade por catálogo de recheios, "a partir
// de", filtro da categoria Bento Cake.
let banco: BancoSimulado;
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => clienteSimulado(banco)) }));

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
    ...parcial,
  };
}

const BOLO = produto({ nome: "Bolo", slug: "bolo", Categoria: "Bolos", tipo: "bolo", preco: 45, unidade_venda: "kg", pedido_minimo: 5, destaque: true });
const SMASH = produto({ nome: "Smash Cake", slug: "smash", Categoria: "Bolos", preco: 70 });
const BENTO = produto({ nome: "Bento Flork", slug: "bento", Categoria: "Bento Cake", tipo: "bento_cake", preco: 60, pedido_minimo: 2, destaque: true });
const DOCE = produto({ nome: "Brigadeiro", slug: "brigadeiro", preco: 3.5 });

const REC_BOLO = { id: "r1", nome: "Brigadeiro", vale_bolo: true, vale_bento: false, preco_kg: 80, grupo: "chocolate_outros", ativo: true };
const REC_BOLO_2 = { id: "r2", nome: "Morango", vale_bolo: true, vale_bento: false, preco_kg: 65, grupo: "frutas", ativo: true };
const REC_BENTO = { id: "r3", nome: "Ninho", vale_bolo: false, vale_bento: true, preco_kg: null, grupo: null, ativo: true };

function montar(recheios: Record<string, unknown>[], papel: "anon" | "admin" = "anon") {
  banco = novoBanco({ produtos: [BOLO, SMASH, BENTO, DOCE], recheios, produto_cento_itens: [] }, papel);
}

const nomes = (itens: { produto: { nome: string } }[] | null) => (itens ?? []).map((i) => i.produto.nome);

beforeEach(() => montar([REC_BOLO, REC_BOLO_2, REC_BENTO]));

describe("Lista — Bolo, Bento Cake e Smash Cake", () => {
  it("com os dois catálogos, tudo aparece; o Bolo ganha 'a partir de' o menor R$/kg", async () => {
    const itens = await buscarLista(null);
    expect(nomes(itens)).toHaveLength(4);
    expect(nomes(itens)).toEqual(expect.arrayContaining(["Bolo", "Bento Flork", "Smash Cake", "Brigadeiro"]));
    expect(itens?.find((i) => i.produto.nome === "Bolo")?.produto.preco_a_partir_de).toBe(65);
  });

  it("filtro Bento Cake mostra só os Bento Cake; filtro Bolos mostra Bolo e Smash", async () => {
    expect(nomes(await buscarLista("Bento Cake"))).toEqual(["Bento Flork"]);
    expect(nomes(await buscarLista("Bolos")).sort()).toEqual(["Bolo", "Smash Cake"]);
  });

  it("sem recheio de Bento: some só o Bento", async () => {
    montar([REC_BOLO, REC_BOLO_2]);
    expect(nomes(await buscarLista(null))).not.toContain("Bento Flork");
    expect(nomes(await buscarLista(null))).toContain("Bolo");
  });

  it("sem recheio de Bolo: some só o Bolo, o Smash Cake fica", async () => {
    montar([REC_BENTO]);
    const todos = nomes(await buscarLista(null));
    expect(todos).not.toContain("Bolo");
    expect(todos).toEqual(expect.arrayContaining(["Smash Cake", "Bento Flork"]));
  });

  it("só consulta recheios quando há Bolo ou Bento na lista", async () => {
    banco = novoBanco({ produtos: [DOCE, SMASH], recheios: [REC_BOLO], produto_cento_itens: [] });
    await buscarLista(null);
    expect(banco.consultas.some((c) => c.startsWith("recheios."))).toBe(false);
  });

  it("falha na consulta dos recheios: a Lista devolve null (aviso de falha, não 'vazia')", async () => {
    banco.falhas.add("recheios");
    expect(await buscarLista(null)).toBeNull();
  });
});

describe("Home — Os mais pedidos", () => {
  it("Bolo e Bento em destaque entram; sem recheio de Bolo, o Bolo sai; o 'a partir de' vai junto", async () => {
    const com = await buscarMaisPedidos();
    expect(com.map((p) => p.nome).sort()).toEqual(["Bento Flork", "Bolo"]);
    expect(com.find((p) => p.nome === "Bolo")?.preco_a_partir_de).toBe(65);
    montar([REC_BENTO]);
    expect((await buscarMaisPedidos()).map((p) => p.nome)).toEqual(["Bento Flork"]);
  });
});

describe("buscarInterna — Bolo e Bento Cake", () => {
  it("Bolo devolve os recheios; Bento devolve os recheios; produto vem com o 'a partir de'", async () => {
    const bolo = await buscarInterna("bolo");
    expect(bolo.estado === "ok" && bolo.recheios.length).toBe(3);
    expect(bolo.estado === "ok" && bolo.produto.preco_a_partir_de).toBe(65);
    const bento = await buscarInterna("bento");
    expect(bento.estado).toBe("ok");
  });

  it("indisponível de um lado só: 404 (nao-encontrado) só daquele lado", async () => {
    montar([REC_BOLO]);
    expect((await buscarInterna("bento")).estado).toBe("nao-encontrado");
    expect((await buscarInterna("bolo")).estado).toBe("ok");
    expect((await buscarInterna("smash")).estado).toBe("ok");
  });

  it("falha nos recheios é 'erro', não 404", async () => {
    banco.falhas.add("recheios");
    expect((await buscarInterna("bolo")).estado).toBe("erro");
    expect((await buscarInterna("smash")).estado).toBe("ok");
  });
});

describe("preço e mínimo nos cards e na interna", () => {
  it("Bolo: 'a partir de R$ X o kg'; sem recheio ativo, 'Sob consulta' sem unidade", () => {
    expect(partesPrecoVitrine({ ...BOLO, preco_a_partir_de: 65 })).toEqual({ prefixo: "a partir de", valor: "R$ 65,00", unidade: "o kg" });
    expect(formatarPrecoVitrine({ ...BOLO, preco_a_partir_de: 65 })).toBe("a partir de R$ 65,00 o kg");
    expect(partesPrecoVitrine({ ...BOLO, preco_a_partir_de: null })).toEqual({ prefixo: null, valor: "Sob consulta", unidade: null });
  });

  it("Bento Cake: preço fixo, sem unidade; Smash Cake e avulso como sempre", () => {
    expect(formatarPrecoVitrine({ ...BENTO, unidade_venda: "kg" })).toBe("R$ 60,00");
    expect(formatarPrecoVitrine(SMASH)).toBe("R$ 70,00");
    expect(formatarPrecoVitrine({ ...DOCE, unidade_venda: "unidade" })).toBe("R$ 3,50 a unidade");
  });

  it("Bolo nunca mostra o pedido mínimo do cadastro; Bento mostra", () => {
    expect(textoMinimo(BOLO)).toBeNull();
    expect(textoMinimoCurto(BOLO)).toBeNull();
    expect(textoMinimo(BENTO)).toBe("Pedido mínimo: 2");
    expect(textoMinimoCurto(BENTO)).toBe("mín. 2");
  });
});

describe("filtro da categoria Bento Cake na URL", () => {
  it("vira bento-cake (sem espaço) e volta para Bento Cake", () => {
    expect(categoriaParaParametro("Bento Cake")).toBe("bento-cake");
    expect(categoriaParaParametro("Bolos")).toBe("bolos");
    expect(categoriaDoParametro("bento-cake")).toBe("Bento Cake");
    expect(categoriaDoParametro("BENTO-CAKE")).toBe("Bento Cake");
    expect(categoriaDoParametro("bento cake")).toBeNull();
  });
});
