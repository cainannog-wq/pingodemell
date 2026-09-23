import { describe, expect, it } from "vitest";
import { categoriaDoParametro, montarLista } from "./lista";
import type { ProdutoVitrine } from "./mais-pedidos";

// Dado simulado: nenhum destes testes lê ou altera o banco.
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
    destaque: false,
    atualizado_em: "2026-09-23T14:29:18.070Z",
    ...parcial,
  };
}

const nomes = (lista: ProdutoVitrine[]) => lista.map((p) => p.nome);
const todosOsNomes = (grupos: ReturnType<typeof montarLista>) => grupos.flatMap((g) => nomes(g.produtos));

// Catálogo simulado com um pouco de tudo, fora de ordem de propósito.
const CATALOGO: ProdutoVitrine[] = [
  produto({ nome: "Suco de Laranja", Categoria: "Bebidas" }),
  produto({ nome: "Kit Festa", Categoria: null }),
  produto({ nome: "Risole de carne", Categoria: "Salgados" }),
  produto({ nome: "Morango Banhado", Categoria: "Doces" }),
  produto({ nome: "Bolo de Chocolate", Categoria: "Bolos" }),
  produto({ nome: "Coxinha", Categoria: "Salgados", ativo: false }),
  produto({ nome: "Beijinho", Categoria: "Doces", tipo: "cento" }),
  produto({ nome: "Torta de Limão", Categoria: "Doces", ativo: false }),
  produto({ nome: "Teste", Categoria: null, ativo: false, destaque: true }),
  produto({ nome: "Coca-cola 2L", Categoria: "Bebidas" }),
  produto({ nome: "Bolo Inativo", Categoria: "Bolos", ativo: false }),
];

describe("Lista — produto inativo nunca aparece", () => {
  it("fica fora de 'Todos' e de cada categoria, inclusive quando é o único da categoria", () => {
    const inativos = ["Coxinha", "Torta de Limão", "Teste", "Bolo Inativo"];
    const visoes = [null, "Bolos", "Doces", "Salgados", "Bebidas"] as const;
    for (const visao of visoes) {
      const mostrados = todosOsNomes(montarLista(CATALOGO, visao));
      for (const inativo of inativos) expect(mostrados).not.toContain(inativo);
    }
  });

  it("categoria só com inativo vira categoria vazia", () => {
    const soInativo = [produto({ nome: "Bolo Inativo", Categoria: "Bolos", ativo: false })];
    expect(montarLista(soInativo, "Bolos")).toEqual([]);
    expect(montarLista(soInativo, null)).toEqual([]);
  });
});

describe("Lista — filtro por categoria", () => {
  it("mostra só a categoria escolhida", () => {
    const grupos = montarLista(CATALOGO, "Doces");
    expect(grupos).toHaveLength(1);
    expect(grupos[0].produtos.every((p) => p.Categoria === "Doces")).toBe(true);
    expect(nomes(grupos[0].produtos)).toEqual(["Beijinho", "Morango Banhado"]);
  });

  it("categoria sem produto ativo devolve lista vazia (a página mostra a mensagem)", () => {
    const semBebida = CATALOGO.filter((p) => p.Categoria !== "Bebidas");
    expect(montarLista(semBebida, "Bebidas")).toEqual([]);
  });
});

describe("Lista — grupos e subtítulos", () => {
  it("'Todos' agrupa na ordem Bolos, Doces, Salgados, Bebidas, Outros", () => {
    const grupos = montarLista(CATALOGO, null);
    expect(grupos.map((g) => g.titulo)).toEqual(["Bolos", "Doces", "Salgados", "Bebidas", "Outros"]);
  });

  it("produto sem categoria aparece só em 'Todos', no grupo 'Outros', no fim", () => {
    const todos = montarLista(CATALOGO, null);
    const ultimo = todos[todos.length - 1];
    expect(ultimo.titulo).toBe("Outros");
    expect(ultimo.categoria).toBeNull();
    expect(nomes(ultimo.produtos)).toEqual(["Kit Festa"]);
    expect(todosOsNomes(todos).at(-1)).toBe("Kit Festa");

    for (const c of ["Bolos", "Doces", "Salgados", "Bebidas"] as const) {
      expect(todosOsNomes(montarLista(CATALOGO, c))).not.toContain("Kit Festa");
    }
  });

  it("subtítulo só existe em 'Todos'; na visão filtrada não há subtítulo", () => {
    expect(montarLista(CATALOGO, null).every((g) => g.titulo !== null)).toBe(true);
    for (const c of ["Bolos", "Doces", "Salgados", "Bebidas"] as const) {
      expect(montarLista(CATALOGO, c).every((g) => g.titulo === null)).toBe(true);
    }
  });

  it("grupo sem produto ativo não aparece (nem o subtítulo)", () => {
    // Sem Bebidas ativas e sem produto sem categoria.
    const catalogo = CATALOGO.filter((p) => p.Categoria !== "Bebidas" && p.Categoria !== null);
    expect(montarLista(catalogo, null).map((g) => g.titulo)).toEqual(["Bolos", "Doces", "Salgados"]);
  });
});

describe("Lista — ordem", () => {
  it("'Todos': agrupado por categoria e alfabético dentro do grupo", () => {
    expect(todosOsNomes(montarLista(CATALOGO, null))).toEqual([
      "Bolo de Chocolate",
      "Beijinho",
      "Morango Banhado",
      "Risole de carne",
      "Coca-cola 2L",
      "Suco de Laranja",
      "Kit Festa",
    ]);
  });

  it("filtrada: só ordem alfabética", () => {
    const salgados = [
      produto({ nome: "Risole", Categoria: "Salgados" }),
      produto({ nome: "Coxinha", Categoria: "Salgados" }),
      produto({ nome: "Empada", Categoria: "Salgados" }),
    ];
    expect(nomes(montarLista(salgados, "Salgados")[0].produtos)).toEqual(["Coxinha", "Empada", "Risole"]);
  });

  it("acento e maiúscula não separam: 'Éclair' junto dos E, 'açaí' junto dos A", () => {
    const doces = ["Zebrinha", "Éclair", "bolo de pote", "açaí na tigela", "Empada doce", "Abacaxi", "Brigadeiro", "éclair de café"].map(
      (nome) => produto({ nome, Categoria: "Doces" })
    );
    expect(nomes(montarLista(doces, "Doces")[0].produtos)).toEqual([
      "Abacaxi",
      "açaí na tigela",
      "bolo de pote",
      "Brigadeiro",
      "Éclair",
      "éclair de café",
      "Empada doce",
      "Zebrinha",
    ]);
  });

  it("número dentro do nome em ordem numérica ('2L' antes de '10L')", () => {
    const bebidas = [produto({ nome: "Refri 10L", Categoria: "Bebidas" }), produto({ nome: "Refri 2L", Categoria: "Bebidas" })];
    expect(nomes(montarLista(bebidas, "Bebidas")[0].produtos)).toEqual(["Refri 2L", "Refri 10L"]);
  });

  it("produto editado mais recentemente não muda de posição (atualizado_em não entra na ordem)", () => {
    const antes = [
      produto({ nome: "Beijinho", atualizado_em: "2026-09-23T10:00:00.000Z" }),
      produto({ nome: "Brigadeiro Gourmet", atualizado_em: "2026-09-23T10:00:00.000Z" }),
      produto({ nome: "Morango Banhado", atualizado_em: "2026-09-23T10:00:00.000Z" }),
    ];
    // Brigadeiro Gourmet editado agora (preço alterado e restaurado).
    const depois = antes.map((p) =>
      p.nome === "Brigadeiro Gourmet" ? { ...p, atualizado_em: "2026-09-23T18:00:00.000Z" } : p
    );
    const ordemAntes = nomes(montarLista(antes, "Doces")[0].produtos);
    const ordemDepois = nomes(montarLista(depois, "Doces")[0].produtos);
    expect(ordemDepois).toEqual(ordemAntes);
    expect(todosOsNomes(montarLista(depois, null))).toEqual(todosOsNomes(montarLista(antes, null)));
  });

  it("a ordem de chegada do banco não importa", () => {
    const invertido = [...CATALOGO].reverse();
    expect(todosOsNomes(montarLista(invertido, null))).toEqual(todosOsNomes(montarLista(CATALOGO, null)));
  });
});

describe("Lista — categoria na URL", () => {
  it("aceita as 4 categorias no formato de ROTAS.listaPorCategoria", () => {
    expect(categoriaDoParametro("bolos")).toBe("Bolos");
    expect(categoriaDoParametro("doces")).toBe("Doces");
    expect(categoriaDoParametro("salgados")).toBe("Salgados");
    expect(categoriaDoParametro("bebidas")).toBe("Bebidas");
  });

  it("categoria inválida, vazia ou ausente cai em 'Todos' (null), sem erro", () => {
    for (const valor of ["kits-festa", "outros", "", "   ", "bolo", "<script>", undefined]) {
      expect(categoriaDoParametro(valor)).toBeNull();
    }
  });

  it("parâmetro repetido usa o primeiro valor", () => {
    expect(categoriaDoParametro(["doces", "bolos"])).toBe("Doces");
    expect(categoriaDoParametro([])).toBeNull();
  });
});
