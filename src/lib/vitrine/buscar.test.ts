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
    then: (ok: (v: typeof resposta) => unknown, erro?: (e: unknown) => unknown) => Promise.resolve(resposta).then(ok, erro),
  };
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
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
    nome: `Produto ${seq}`,
    descricao: null,
    preco: 10,
    image_url: null,
    Categoria: "Doces",
    tipo: "normal",
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
    const grupos = await buscarLista(null);
    const nomes = grupos!.flatMap((g) => g.produtos.map((p) => p.nome));
    expect(nomes).toEqual(["Brigadeiro Gourmet", "Empada de palmito", "Kit Festa Sortido"]);
  });

  it("mesmo que o banco devolva inativos, nenhum aparece na categoria filtrada", async () => {
    const { buscarLista } = await import("./buscar");
    for (const categoria of ["Doces", "Salgados"] as const) {
      const grupos = await buscarLista(categoria);
      const produtos = grupos!.flatMap((g) => g.produtos);
      expect(produtos.every((p) => p.ativo)).toBe(true);
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
