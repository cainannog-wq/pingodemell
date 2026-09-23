import { describe, expect, it } from "vitest";
import { categoriaDoParametro, montarLista, type ItemLista } from "./lista";
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

const nomes = (itens: ItemLista[]) => itens.map((i) => i.produto.nome);
const comSelo = (itens: ItemLista[]) => itens.filter((i) => i.maisPedido).map((i) => i.produto.nome);

// Catálogo simulado com um pouco de tudo, fora de ordem de propósito.
const CATALOGO: ProdutoVitrine[] = [
  produto({ nome: "Suco de Laranja", Categoria: "Bebidas" }),
  produto({ nome: "Coca-cola 2L", Categoria: "Bebidas", destaque: true }),
  produto({ nome: "Kit Festa", Categoria: null }),
  produto({ nome: "Risole de carne", Categoria: "Salgados" }),
  produto({ nome: "Morango Banhado", Categoria: "Doces" }),
  produto({ nome: "Brigadeiro Gourmet", Categoria: "Doces", destaque: true }),
  produto({ nome: "Bolo de Chocolate", Categoria: "Bolos", destaque: true }),
  produto({ nome: "Cento de salgados", Categoria: "Salgados", destaque: true, tipo: "cento" }),
  produto({ nome: "Coxinha", Categoria: "Salgados", ativo: false, destaque: true }),
  produto({ nome: "Beijinho", Categoria: "Doces", tipo: "cento", destaque: true }),
  produto({ nome: "Torta de Limão", Categoria: "Doces", ativo: false }),
  produto({ nome: "Teste", Categoria: null, ativo: false, destaque: true }),
  produto({ nome: "Empada", Categoria: "Salgados" }),
];

describe("Lista — destaques primeiro", () => {
  it("'Todos': destaques (fora bebida) antes dos outros, alfabética dentro de cada bloco", () => {
    const itens = montarLista(CATALOGO, null);
    expect(nomes(itens)).toEqual([
      // bloco de destaques
      "Beijinho",
      "Bolo de Chocolate",
      "Brigadeiro Gourmet",
      "Cento de salgados",
      // bloco de baixo
      "Coca-cola 2L",
      "Empada",
      "Kit Festa",
      "Morango Banhado",
      "Risole de carne",
      "Suco de Laranja",
    ]);
  });

  it("selo só nos destaques que sobem", () => {
    const itens = montarLista(CATALOGO, null);
    expect(comSelo(itens)).toEqual(["Beijinho", "Bolo de Chocolate", "Brigadeiro Gourmet", "Cento de salgados"]);
    // O bloco de cima é exatamente o dos itens com selo.
    const primeiroSemSelo = itens.findIndex((i) => !i.maisPedido);
    expect(itens.slice(primeiroSemSelo).every((i) => !i.maisPedido)).toBe(true);
  });

  it("bebida em destaque fica no bloco de baixo, em ordem alfabética, sem selo", () => {
    const itens = montarLista(CATALOGO, null);
    const coca = itens.find((i) => i.produto.nome === "Coca-cola 2L")!;
    expect(coca.maisPedido).toBe(false);
    expect(nomes(itens).indexOf("Coca-cola 2L")).toBeGreaterThan(nomes(itens).indexOf("Cento de salgados"));
    expect(nomes(itens).indexOf("Coca-cola 2L")).toBeLessThan(nomes(itens).indexOf("Empada"));
  });

  it("produto sem categoria em destaque sobe, com selo", () => {
    const itens = montarLista([...CATALOGO, produto({ nome: "Kit Aniversário", Categoria: null, destaque: true })], null);
    expect(comSelo(itens)).toContain("Kit Aniversário");
    expect(nomes(itens).indexOf("Kit Aniversário")).toBeLessThan(nomes(itens).indexOf("Coca-cola 2L"));
  });

  it("produto sem categoria sem destaque fica no bloco de baixo, na ordem alfabética (não vai pro fim)", () => {
    const itens = montarLista(CATALOGO, null);
    expect(nomes(itens).indexOf("Kit Festa")).toBeLessThan(nomes(itens).indexOf("Morango Banhado"));
  });

  it("em Bebidas nenhuma sobe: tudo em ordem alfabética, sem selo", () => {
    const itens = montarLista(CATALOGO, "Bebidas");
    expect(nomes(itens)).toEqual(["Coca-cola 2L", "Suco de Laranja"]);
    expect(comSelo(itens)).toEqual([]);
  });
});

describe("Lista — mesma regra na visão filtrada", () => {
  it("Doces: destaques com selo primeiro, depois os outros", () => {
    const itens = montarLista(CATALOGO, "Doces");
    expect(nomes(itens)).toEqual(["Beijinho", "Brigadeiro Gourmet", "Morango Banhado"]);
    expect(comSelo(itens)).toEqual(["Beijinho", "Brigadeiro Gourmet"]);
  });

  it("Salgados: destaque com selo primeiro, depois os outros", () => {
    const itens = montarLista(CATALOGO, "Salgados");
    expect(nomes(itens)).toEqual(["Cento de salgados", "Empada", "Risole de carne"]);
    expect(comSelo(itens)).toEqual(["Cento de salgados"]);
  });

  it("mostra só a categoria escolhida; sem categoria só aparece em 'Todos'", () => {
    for (const c of ["Bolos", "Doces", "Salgados", "Bebidas"] as const) {
      const itens = montarLista(CATALOGO, c);
      expect(itens.every((i) => i.produto.Categoria === c)).toBe(true);
      expect(nomes(itens)).not.toContain("Kit Festa");
    }
    expect(nomes(montarLista(CATALOGO, null))).toContain("Kit Festa");
  });

  it("categoria sem produto ativo devolve lista vazia (a página mostra a mensagem)", () => {
    const semBebida = CATALOGO.filter((p) => p.Categoria !== "Bebidas");
    expect(montarLista(semBebida, "Bebidas")).toEqual([]);
  });
});

describe("Lista — produto inativo nunca aparece", () => {
  it("fica fora de 'Todos' e de cada categoria, inclusive inativo com destaque", () => {
    const inativos = ["Coxinha", "Torta de Limão", "Teste"];
    for (const visao of [null, "Bolos", "Doces", "Salgados", "Bebidas"] as const) {
      const mostrados = nomes(montarLista(CATALOGO, visao));
      for (const inativo of inativos) expect(mostrados).not.toContain(inativo);
    }
  });

  it("categoria só com inativo vira categoria vazia", () => {
    const soInativo = [produto({ nome: "Bolo Inativo", Categoria: "Bolos", ativo: false, destaque: true })];
    expect(montarLista(soInativo, "Bolos")).toEqual([]);
    expect(montarLista(soInativo, null)).toEqual([]);
  });
});

describe("Lista — ordem não depende de edição", () => {
  it("produto editado mais recentemente não muda de posição (atualizado_em não entra na ordem)", () => {
    const depois = CATALOGO.map((p) =>
      p.nome === "Brigadeiro Gourmet" ? { ...p, preco: 2.4, atualizado_em: "2026-09-23T20:00:00.000Z" } : p
    );
    for (const visao of [null, "Doces"] as const) {
      expect(nomes(montarLista(depois, visao))).toEqual(nomes(montarLista(CATALOGO, visao)));
    }
  });

  it("ligar o destaque sobe o produto pro bloco de cima, com selo; desligar devolve ao lugar de antes", () => {
    const antes = nomes(montarLista(CATALOGO, "Salgados"));
    const ligado = CATALOGO.map((p) => (p.nome === "Risole de carne" ? { ...p, destaque: true } : p));
    const itensLigado = montarLista(ligado, "Salgados");
    expect(nomes(itensLigado)).toEqual(["Cento de salgados", "Risole de carne", "Empada"]);
    expect(comSelo(itensLigado)).toContain("Risole de carne");
    const desligado = ligado.map((p) => (p.nome === "Risole de carne" ? { ...p, destaque: false } : p));
    expect(nomes(montarLista(desligado, "Salgados"))).toEqual(antes);
  });

  it("a ordem de chegada do banco não importa", () => {
    expect(nomes(montarLista([...CATALOGO].reverse(), null))).toEqual(nomes(montarLista(CATALOGO, null)));
  });
});

describe("Lista — ordem alfabética em português", () => {
  it("acento e maiúscula não separam: 'Éclair' junto dos E, 'açaí' junto dos A", () => {
    const doces = ["Zebrinha", "Éclair", "bolo de pote", "açaí na tigela", "Empada doce", "Abacaxi", "Brigadeiro", "éclair de café"].map(
      (nome) => produto({ nome, Categoria: "Doces" })
    );
    expect(nomes(montarLista(doces, "Doces"))).toEqual([
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

  it("a mesma regra vale dentro do bloco de destaques", () => {
    const doces = ["Éclair", "açaí", "Bolo"].map((nome) => produto({ nome, Categoria: "Doces", destaque: true }));
    expect(nomes(montarLista(doces, null))).toEqual(["açaí", "Bolo", "Éclair"]);
  });

  it("número dentro do nome em ordem numérica ('2L' antes de '10L')", () => {
    const bebidas = [produto({ nome: "Refri 10L", Categoria: "Bebidas" }), produto({ nome: "Refri 2L", Categoria: "Bebidas" })];
    expect(nomes(montarLista(bebidas, "Bebidas"))).toEqual(["Refri 2L", "Refri 10L"]);
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
