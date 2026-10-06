import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clienteSimulado, novoBanco, type BancoSimulado } from "@/test/banco-simulado";
import type { ProdutoVitrine } from "./mais-pedidos";

// buscarInterna, "Os mais pedidos" e "Combina com o seu pedido" contra o
// banco simulado (nada real). Os casos de Cento com 1 e 0 sabor ativo são
// dados simulados: nenhum produto real é desativado para provar isso.
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

const MORANGO = produto({ nome: "Morango Banhado", slug: "morango-banhado", image_url: "https://x/capa.jpg", destaque: true });
const TORTA = produto({ nome: "Torta de Limão", slug: "torta-de-limao", ativo: false });
const EMPADA = produto({ nome: "Empada", slug: "empada", Categoria: "Salgados", destaque: true, atualizado_em: "2026-09-25T00:00:00Z" });
const COCA = produto({ nome: "Coca-cola 2L", slug: "coca", Categoria: "Bebidas", destaque: true, atualizado_em: "2026-09-27T00:00:00Z" });
const CENTO_2 = produto({ nome: "Cento Dois", slug: "cento-dois", tipo: "cento", destaque: true });
const CENTO_1 = produto({ nome: "Cento Um", slug: "cento-um", tipo: "cento", destaque: true });
const CENTO_0 = produto({ nome: "Cento Zero", slug: "cento-zero", tipo: "cento", destaque: true, atualizado_em: "2026-09-28T00:00:00Z" });

const SABORES = [
  { cento_nome: "Cento Dois", subitem_nome: "Empada", ordem: 1 },
  { cento_nome: "Cento Dois", subitem_nome: "Morango Banhado", ordem: 0 },
  { cento_nome: "Cento Um", subitem_nome: "Empada", ordem: 0 },
  { cento_nome: "Cento Um", subitem_nome: "Torta de Limão", ordem: 1 },
  { cento_nome: "Cento Zero", subitem_nome: "Torta de Limão", ordem: 0 },
];

const FOTOS = [
  { produto_id: MORANGO.id, caminho: "galeria/m/c.webp", posicao: 3 },
  { produto_id: MORANGO.id, caminho: "galeria/m/a.webp", posicao: 1 },
  { produto_id: MORANGO.id, caminho: "galeria/m/b.webp", posicao: 2 },
];

function montar(papel: "anon" | "admin") {
  banco = novoBanco(
    {
      produtos: [MORANGO, TORTA, EMPADA, COCA, CENTO_2, CENTO_1, CENTO_0],
      produto_cento_itens: SABORES,
      produto_fotos: FOTOS,
    },
    papel
  );
}

beforeEach(() => montar("admin"));

describe("buscarInterna", () => {
  it("avulso ativo: produto, sem sabores, e a galeria com capa + extras na ordem da posição", async () => {
    const { buscarInterna } = await import("./buscar");
    const r = await buscarInterna("morango-banhado");
    expect(r.estado).toBe("ok");
    if (r.estado !== "ok") return;
    expect(r.produto.nome).toBe("Morango Banhado");
    expect(r.sabores).toEqual([]);
    expect(r.fotos.map((f) => f.url)).toEqual([
      "https://x/capa.jpg",
      "https://storage/galeria/m/a.webp",
      "https://storage/galeria/m/b.webp",
      "https://storage/galeria/m/c.webp",
    ]);
    expect(r.fotos[0].alt).toBe("Morango Banhado, foto 1 de 4");
    expect(banco.consultas).toContain("produtos.ativo=true");
  });

  it("produto inativo cai na 404, mesmo que a sessão do admin o receba do banco", async () => {
    const { buscarInterna } = await import("./buscar");
    expect(await buscarInterna("torta-de-limao")).toEqual({ estado: "nao-encontrado" });
  });

  it("slug inexistente ou fora do formato cai na 404 (fora do formato nem consulta)", async () => {
    const { buscarInterna } = await import("./buscar");
    expect(await buscarInterna("nao-existe")).toEqual({ estado: "nao-encontrado" });
    banco.consultas.length = 0;
    expect(await buscarInterna("../x")).toEqual({ estado: "nao-encontrado" });
    expect(banco.consultas).toEqual([]);
  });

  it("Cento: sabores ativos na ordem do cadastro", async () => {
    const { buscarInterna } = await import("./buscar");
    const r = await buscarInterna("cento-dois");
    expect(r.estado === "ok" && r.sabores).toEqual(["Morango Banhado", "Empada"]);
  });

  for (const papel of ["admin", "anon"] as const) {
    it(`Cento com 1 sabor ativo (simulado, ${papel}): só ele`, async () => {
      montar(papel);
      const { buscarInterna } = await import("./buscar");
      const r = await buscarInterna("cento-um");
      expect(r.estado === "ok" && r.sabores).toEqual(["Empada"]);
    });

    it(`Cento com 0 sabor ativo (simulado, ${papel}): indisponível, cai na 404`, async () => {
      montar(papel);
      const { buscarInterna } = await import("./buscar");
      expect(await buscarInterna("cento-zero")).toEqual({ estado: "nao-encontrado" });
    });
  }

  it("falha do banco no produto ou nos sabores: aviso de falha, não 404", async () => {
    const { buscarInterna } = await import("./buscar");
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    banco.falhas.add("produto_cento_itens");
    expect(await buscarInterna("cento-dois")).toEqual({ estado: "erro" });
    banco.falhas.add("produtos");
    expect(await buscarInterna("morango-banhado")).toEqual({ estado: "erro" });
    erro.mockRestore();
  });

  it("falha só nas fotos extras: mostra a capa", async () => {
    const { buscarInterna } = await import("./buscar");
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    banco.falhas.add("produto_fotos");
    const r = await buscarInterna("morango-banhado");
    expect(r.estado === "ok" && r.fotos).toEqual([{ url: "https://x/capa.jpg", alt: "Morango Banhado, foto 1 de 1" }]);
    erro.mockRestore();
  });
});

describe("Home e Combina com o seu pedido", () => {
  it("'Os mais pedidos' tira o Cento sem sabor ativo e a bebida", async () => {
    const { buscarMaisPedidos } = await import("./buscar");
    const nomes = (await buscarMaisPedidos()).map((p) => p.nome);
    expect(nomes).not.toContain("Cento Zero");
    expect(nomes).not.toContain("Coca-cola 2L");
    expect(nomes).toEqual(expect.arrayContaining(["Cento Dois", "Cento Um", "Morango Banhado", "Empada"]));
  });

  it("relacionados: destaques sem o próprio produto, sem bebida, sem Cento indisponível, no máximo 3", async () => {
    const { buscarRelacionados } = await import("./buscar");
    const nomes = (await buscarRelacionados(EMPADA.id)).map((p) => p.nome);
    expect(nomes).toHaveLength(3);
    expect(nomes).not.toContain("Empada");
    expect(nomes).not.toContain("Coca-cola 2L");
    expect(nomes).not.toContain("Cento Zero");
  });
});

// PR perf/vitrine-consultas-cache: cada consulta em sequência custa uma
// viagem inteira até o banco. Estes testes contam quantas consultas já
// tinham saído quando a primeira resposta chegou: tudo o que é
// independente sai junto, numa viagem só.
describe("uma viagem só ao banco", () => {
  afterEach(async () => {
    const { createClient } = await import("@/lib/supabase/server");
    vi.mocked(createClient).mockImplementation(async () => clienteSimulado(banco) as never);
  });

  function clienteContado() {
    const real = clienteSimulado(banco);
    const saidas: string[] = [];
    let antesDaPrimeiraResposta: string[] | null = null;
    const atrasar = <T,>(v: T) =>
      new Promise<T>((ok) =>
        setTimeout(() => {
          antesDaPrimeiraResposta ??= [...saidas];
          ok(v);
        }, 0)
      );
    const cliente = {
      ...real,
      from(tabela: string) {
        saidas.push(tabela);
        const b = real.from(tabela);
        const embrulho: Record<string, unknown> = {};
        for (const m of ["select", "eq", "in", "order"] as const) {
          embrulho[m] = (...args: unknown[]) => {
            (b[m] as (...a: unknown[]) => unknown)(...args);
            return embrulho;
          };
        }
        embrulho.maybeSingle = () => b.maybeSingle().then(atrasar);
        embrulho.then = (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) =>
          Promise.resolve(b).then(atrasar).then(ok, erro);
        return embrulho;
      },
    };
    return { cliente, saidas, primeiras: () => antesDaPrimeiraResposta };
  }

  async function comClienteContado() {
    const contado = clienteContado();
    const { createClient } = await import("@/lib/supabase/server");
    vi.mocked(createClient).mockImplementation(async () => contado.cliente as never);
    return contado;
  }

  it("interna: produto (com os sabores embutidos), fotos e recheios saem juntos", async () => {
    const contado = await comClienteContado();
    const { buscarInterna } = await import("./buscar");
    expect((await buscarInterna("cento-dois")).estado).toBe("ok");
    expect([...contado.primeiras()!].sort()).toEqual(["produto_fotos", "produtos", "recheios"]);
    expect(contado.saidas).toHaveLength(3);
  });

  it("Lista e Home: produtos (com os sabores embutidos) e recheios saem juntos, e nada mais", async () => {
    for (const buscar of ["lista", "home"] as const) {
      const contado = await comClienteContado();
      const { buscarLista, buscarMaisPedidos } = await import("./buscar");
      await (buscar === "lista" ? buscarLista(null) : buscarMaisPedidos());
      expect([...contado.primeiras()!].sort()).toEqual(["produtos", "recheios"]);
      expect(contado.saidas).toHaveLength(2);
    }
  });
});

describe("sabor inativo escondido, nos dois papéis", () => {
  for (const papel of ["admin", "anon"] as const) {
    it(`${papel}: Cento só com sabor inativo some da Home e da Lista; sabor inativo não aparece na interna`, async () => {
      montar(papel);
      const { buscarLista, buscarMaisPedidos, buscarInterna } = await import("./buscar");
      expect((await buscarMaisPedidos()).map((p) => p.nome)).not.toContain("Cento Zero");
      expect((await buscarLista(null))!.map((i) => i.produto.nome)).not.toContain("Cento Zero");
      const um = await buscarInterna("cento-um");
      expect(um.estado === "ok" && um.sabores).toEqual(["Empada"]);
    });
  }

  it("os sabores embutidos não vão junto com o produto para a tela", async () => {
    const { buscarLista, buscarMaisPedidos, buscarInterna } = await import("./buscar");
    for (const p of await buscarMaisPedidos()) expect(p).not.toHaveProperty("sabores");
    for (const i of (await buscarLista(null))!) expect(i.produto).not.toHaveProperty("sabores");
    const r = await buscarInterna("cento-dois");
    expect(r.estado === "ok" && r.produto).not.toHaveProperty("sabores");
  });
});

describe("falha parcial", () => {
  it("falha dos recheios não muda nada para avulso nem Cento (eles não usam recheio)", async () => {
    banco.falhas.add("recheios");
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    const { buscarInterna, buscarMaisPedidos } = await import("./buscar");
    expect((await buscarInterna("morango-banhado")).estado).toBe("ok");
    expect((await buscarInterna("cento-dois")).estado).toBe("ok");
    expect((await buscarMaisPedidos()).map((p) => p.nome)).toEqual(expect.arrayContaining(["Cento Dois", "Morango Banhado"]));
    erro.mockRestore();
  });

  it("falha nos sabores derruba o produto (aviso de falha), como antes", async () => {
    banco.falhas.add("produto_cento_itens");
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    const { buscarInterna, buscarLista } = await import("./buscar");
    expect(await buscarInterna("cento-dois")).toEqual({ estado: "erro" });
    expect(await buscarLista(null)).toBeNull();
    erro.mockRestore();
  });
});

describe("ordem dos itens", () => {
  it("sabores na ordem do cadastro e fotos na ordem da posição, mesmo com o banco devolvendo fora de ordem", async () => {
    const { buscarInterna } = await import("./buscar");
    const cento = await buscarInterna("cento-dois");
    expect(cento.estado === "ok" && cento.sabores).toEqual(["Morango Banhado", "Empada"]);
    const morango = await buscarInterna("morango-banhado");
    expect(morango.estado === "ok" && morango.fotos.map((f) => f.url.split("/").pop())).toEqual(["capa.jpg", "a.webp", "b.webp", "c.webp"]);
  });
});
