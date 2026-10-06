import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProdutoVitrine } from "./mais-pedidos";

// Simula o cliente do Supabase de um ADMIN LOGADO navegando no site: a
// sessão do cookie lê todos os produtos, então o "banco" aqui devolve
// inativos mesmo com o filtro de ativo na consulta. Prova que a regra no
// código segura o inativo de qualquer jeito. Nenhum teste lê o banco.
let resposta: { data: ProdutoVitrine[] | null; error: { message: string } | null };
const chamadas: { metodo: string; args: unknown[] }[] = [];

function consulta() {
  const builder = {
    select: (...args: unknown[]) => {
      chamadas.push({ metodo: "select", args });
      return builder;
    },
    eq: (...args: unknown[]) => {
      chamadas.push({ metodo: "eq", args });
      return builder;
    },
    // Uma linha: a primeira que o "banco" devolveria (ou nenhuma).
    maybeSingle: async () => {
      chamadas.push({ metodo: "maybeSingle", args: [] });
      return { data: resposta.data?.[0] ?? null, error: resposta.error };
    },
    then: (ok: (v: typeof resposta) => unknown, erro?: (e: unknown) => unknown) => Promise.resolve(resposta).then(ok, erro),
  };
  return builder;
}

vi.mock("@/lib/supabase/publico", () => ({
  createPublicClient: vi.fn(() => ({
    from: (tabela: string) => {
      chamadas.push({ metodo: "from", args: [tabela] });
      return consulta();
    },
  })),
}));

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
    destaque: true,
    atualizado_em: "2026-09-23T14:29:18.070Z",
    ...parcial,
  };
}

const DO_BANCO_COM_INATIVOS = [
  produto({ nome: "Brigadeiro Gourmet", Categoria: "Doces" }),
  produto({ nome: "Torta de Limão", Categoria: "Doces", ativo: false }),
  produto({ nome: "Empada de palmito", Categoria: "Salgados" }),
  produto({ nome: "Coxinha de frango", Categoria: "Salgados", ativo: false }),
  produto({ nome: "Teste", Categoria: null, ativo: false }),
  produto({ nome: "Kit Festa Sortido", Categoria: null }),
];

beforeEach(() => {
  chamadas.length = 0;
  resposta = { data: DO_BANCO_COM_INATIVOS, error: null };
});

describe("buscarLista — admin logado navegando no site", () => {
  it("pede só ativos ao banco", async () => {
    const { buscarLista } = await import("./buscar");
    await buscarLista(null);
    expect(chamadas).toContainEqual({ metodo: "from", args: ["produtos"] });
    expect(chamadas).toContainEqual({ metodo: "eq", args: ["ativo", true] });
  });

  it("mesmo que o banco devolva inativos, nenhum aparece em 'Todos'", async () => {
    const { buscarLista } = await import("./buscar");
    const itens = await buscarLista(null);
    const nomes = itens!.map((i) => i.produto.nome);
    expect(nomes).toEqual(["Brigadeiro Gourmet", "Empada de palmito", "Kit Festa Sortido"]);
  });

  it("mesmo que o banco devolva inativos, nenhum aparece na categoria filtrada", async () => {
    const { buscarLista } = await import("./buscar");
    for (const categoria of ["Doces", "Salgados"] as const) {
      const itens = await buscarLista(categoria);
      expect(itens!.length).toBeGreaterThan(0);
      expect(itens!.every((i) => i.produto.ativo)).toBe(true);
      expect(chamadas).toContainEqual({ metodo: "eq", args: ["Categoria", categoria] });
    }
  });

  it("falha do banco devolve null (a página mostra aviso de falha, não 'categoria vazia')", async () => {
    resposta = { data: null, error: { message: "boom" } };
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    const { buscarLista } = await import("./buscar");
    expect(await buscarLista("Doces")).toBeNull();
    erro.mockRestore();
  });
});

describe("buscarMaisPedidos (Home) — mesmo cuidado", () => {
  it("pede só ativo + destaque e, mesmo recebendo inativo com destaque, não o mostra", async () => {
    resposta = {
      data: [
        produto({ nome: "Brigadeiro Gourmet", destaque: true }),
        produto({ nome: "Teste", Categoria: null, ativo: false, destaque: true }),
      ],
      error: null,
    };
    const { buscarMaisPedidos } = await import("./buscar");
    const produtos = await buscarMaisPedidos();
    expect(chamadas).toContainEqual({ metodo: "eq", args: ["ativo", true] });
    expect(chamadas).toContainEqual({ metodo: "eq", args: ["destaque", true] });
    expect(produtos.map((p) => p.nome)).toEqual(["Brigadeiro Gourmet"]);
  });
});

describe("buscarProdutoPorSlug (interna) — só ativo, filtro na consulta", () => {
  it("pede ao banco o slug e só ativo, e devolve o produto ativo", async () => {
    const ativo = produto({ nome: "Brigadeiro Gourmet", slug: "brigadeiro-gourmet" });
    resposta = { data: [ativo], error: null };
    const { buscarProdutoPorSlug } = await import("./buscar");
    expect(await buscarProdutoPorSlug("brigadeiro-gourmet")).toEqual(ativo);
    expect(chamadas).toContainEqual({ metodo: "from", args: ["produtos"] });
    expect(chamadas).toContainEqual({ metodo: "eq", args: ["slug", "brigadeiro-gourmet"] });
    expect(chamadas).toContainEqual({ metodo: "eq", args: ["ativo", true] });
  });

  it("mesmo que o banco devolva um inativo (admin logado navegando no site), volta vazio", async () => {
    resposta = { data: [produto({ nome: "Torta de Limão", slug: "torta-de-limao-fatia", ativo: false })], error: null };
    const { buscarProdutoPorSlug } = await import("./buscar");
    expect(await buscarProdutoPorSlug("torta-de-limao-fatia")).toBeNull();
  });

  it("slug inexistente volta vazio", async () => {
    resposta = { data: [], error: null };
    const { buscarProdutoPorSlug } = await import("./buscar");
    expect(await buscarProdutoPorSlug("nao-existe")).toBeNull();
  });

  it("slug fora do formato volta vazio sem consultar o banco", async () => {
    const { buscarProdutoPorSlug } = await import("./buscar");
    for (const slug of ["", "Brigadeiro", "a--b", "-a", "a-", "a b", "../x", "3f1c9a52-0000-4000-8000-00000000000Z"]) {
      expect(await buscarProdutoPorSlug(slug)).toBeNull();
    }
    expect(chamadas).toEqual([]);
  });

  it("falha do banco volta vazio e vai para o log", async () => {
    resposta = { data: null, error: { message: "boom" } };
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    const { buscarProdutoPorSlug } = await import("./buscar");
    expect(await buscarProdutoPorSlug("brigadeiro-gourmet")).toBeNull();
    expect(erro).toHaveBeenCalled();
    erro.mockRestore();
  });
});
