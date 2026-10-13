import { describe, expect, it } from "vitest";
import { urlDaLista } from "@/lib/site/rotas";
import {
  CATEGORIAS_DA_LISTA,
  POR_PAGINA,
  categoriaDoParametro,
  lerParametrosDaLista,
  montarLista,
  ordemDoParametro,
  paginaDoParametro,
  paginasVisiveis,
  type ParametrosLista,
  type ResultadoLista,
} from "./lista";
import type { ProdutoVitrine } from "./mais-pedidos";

// Dado simulado: nenhum destes testes lê ou altera o banco.
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

const TODOS: ParametrosLista = { categoria: null, busca: "", ordem: "recomendados", pagina: 1 };
const lista = (produtos: ProdutoVitrine[], p: Partial<ParametrosLista> = {}) => montarLista(produtos, { ...TODOS, ...p });
const nomes = (r: ResultadoLista) => r.itens.map((i) => i.produto.nome);
const comSelo = (r: ResultadoLista) => r.itens.filter((i) => i.maisPedido).map((i) => i.produto.nome);

// Catálogo simulado com um pouco de tudo, fora de ordem de propósito.
const CATALOGO: ProdutoVitrine[] = [
  produto({ nome: "Suco de Laranja", Categoria: "Bebidas" }),
  produto({ nome: "Coca-cola 2L", Categoria: "Bebidas", destaque: true }),
  produto({ nome: "Vela Número 5", Categoria: "Adicionais", destaque: true }),
  produto({ nome: "Balão", Categoria: "Adicionais" }),
  produto({ nome: "Kit Sem Categoria", Categoria: null }),
  produto({ nome: "Bento Flork", Categoria: "Bento Cake", tipo: "bento_cake", destaque: true }),
  produto({ nome: "Bento Amor", Categoria: "Bento Cake", tipo: "bento_cake" }),
  produto({ nome: "Kit Festa", Categoria: "Kit Festa" }),
  produto({ nome: "Kit Básico", Categoria: "Kit Festa", destaque: true }),
  produto({ nome: "Risole de carne", Categoria: "Salgados" }),
  produto({ nome: "Morango Banhado", Categoria: "Doces" }),
  produto({ nome: "Pão de Mel", Categoria: "Doces" }),
  produto({ nome: "Brigadeiro Gourmet", Categoria: "Doces", destaque: true }),
  produto({ nome: "Bolo de Chocolate", Categoria: "Bolos", destaque: true }),
  produto({ nome: "Bolo de Cenoura", Categoria: "Bolos" }),
  produto({ nome: "Cento de salgados", Categoria: "Salgados", destaque: true, tipo: "cento" }),
  produto({ nome: "Coxinha", Categoria: "Salgados", ativo: false, destaque: true }),
  produto({ nome: "Beijinho", Categoria: "Doces", destaque: true }),
  produto({ nome: "Torta de Limão", Categoria: "Doces", ativo: false }),
  produto({ nome: "Empada", Categoria: "Salgados" }),
];

// N produtos de Doces com nomes que ordenam pelo número ("Doce 01" ...).
const muitos = (n: number, parcial: Partial<ProdutoVitrine> = {}) =>
  Array.from({ length: n }, (_, i) => produto({ nome: `Doce ${String(i + 1).padStart(3, "0")}`, Categoria: "Doces", ...parcial }));

describe("Lista — o que entra", () => {
  it("Adicionais e Bebidas ficam fora de 'Todos', mesmo em destaque", () => {
    const r = lista(CATALOGO);
    for (const fora of ["Suco de Laranja", "Coca-cola 2L", "Vela Número 5", "Balão"]) expect(nomes(r)).not.toContain(fora);
    expect(r.itens.every((i) => i.produto.Categoria !== "Adicionais" && i.produto.Categoria !== "Bebidas")).toBe(true);
  });

  it("só produto ativo, em qualquer visão e qualquer ordem, inclusive inativo com destaque", () => {
    for (const categoria of [null, ...CATEGORIAS_DA_LISTA]) {
      for (const ordem of ["recomendados", "mais-pedidos", "a-z", "z-a"] as const) {
        const r = lista(CATALOGO, { categoria, ordem });
        expect(nomes(r)).not.toContain("Coxinha");
        expect(nomes(r)).not.toContain("Torta de Limão");
        expect(r.itens.every((i) => i.produto.ativo)).toBe(true);
      }
    }
  });

  it("produto sem categoria (o banco não aceita mais) fica fora", () => {
    expect(nomes(lista(CATALOGO))).not.toContain("Kit Sem Categoria");
  });

  it("categoria escolhida mostra só ela", () => {
    for (const categoria of CATEGORIAS_DA_LISTA) {
      const r = lista(CATALOGO, { categoria });
      expect(r.total).toBeGreaterThan(0);
      expect(r.itens.every((i) => i.produto.Categoria === categoria)).toBe(true);
    }
  });

  it("'Todos' tem exatamente os ativos das 5 categorias da Lista", () => {
    expect(lista(CATALOGO).total).toBe(13);
  });
});

describe("Lista — ordem Recomendados (padrão)", () => {
  it("'Todos': Bolos, Doces, Salgados, Kits, Bento Cake; dentro de cada uma, destaques e depois A a Z", () => {
    expect(nomes(lista(CATALOGO))).toEqual([
      "Bolo de Chocolate",
      "Bolo de Cenoura",
      "Beijinho",
      "Brigadeiro Gourmet",
      "Morango Banhado",
      "Pão de Mel",
      "Cento de salgados",
      "Empada",
      "Risole de carne",
      "Kit Básico",
      "Kit Festa",
      "Bento Flork",
      "Bento Amor",
    ]);
  });

  it("numa categoria: destaques primeiro, depois A a Z", () => {
    expect(nomes(lista(CATALOGO, { categoria: "Doces" }))).toEqual(["Beijinho", "Brigadeiro Gourmet", "Morango Banhado", "Pão de Mel"]);
    expect(nomes(lista(CATALOGO, { categoria: "Salgados" }))).toEqual(["Cento de salgados", "Empada", "Risole de carne"]);
  });

  it("?ordem= ausente ou desconhecido é Recomendados", () => {
    expect(ordemDoParametro(undefined)).toBe("recomendados");
    for (const valor of ["", "preco", "menor-preco", "aleatorio", "<x>"]) expect(ordemDoParametro(valor)).toBe("recomendados");
    expect(nomes(lista(CATALOGO, { ordem: ordemDoParametro("preco") }))).toEqual(nomes(lista(CATALOGO)));
  });

  it("editar um produto (atualizado_em) não muda a posição; a ordem de chegada do banco também não", () => {
    const editado = CATALOGO.map((p) => (p.nome === "Pão de Mel" ? { ...p, atualizado_em: "2026-10-11T20:00:00.000Z" } : p));
    expect(nomes(lista(editado))).toEqual(nomes(lista(CATALOGO)));
    expect(nomes(lista([...CATALOGO].reverse()))).toEqual(nomes(lista(CATALOGO)));
  });
});

describe("Lista — ordem Mais pedidos", () => {
  it("'Todos': destaques primeiro (de qualquer categoria), depois A a Z", () => {
    const r = lista(CATALOGO, { ordem: "mais-pedidos" });
    expect(r.ordem).toBe("mais-pedidos");
    expect(nomes(r)).toEqual([
      "Beijinho",
      "Bento Flork",
      "Bolo de Chocolate",
      "Brigadeiro Gourmet",
      "Cento de salgados",
      "Kit Básico",
      "Bento Amor",
      "Bolo de Cenoura",
      "Empada",
      "Kit Festa",
      "Morango Banhado",
      "Pão de Mel",
      "Risole de carne",
    ]);
  });

  it("aparece em 'Todos' quando há ao menos um destaque", () => {
    expect(lista(CATALOGO).maisPedidosDisponivel).toBe(true);
  });

  it("some em qualquer categoria específica", () => {
    for (const categoria of CATEGORIAS_DA_LISTA) expect(lista(CATALOGO, { categoria }).maisPedidosDisponivel).toBe(false);
  });

  it("some em 'Todos' sem nenhum destaque (destaque só de Adicionais ou Bebidas não conta)", () => {
    const semDestaque = CATALOGO.map((p) =>
      p.Categoria === "Adicionais" || p.Categoria === "Bebidas" ? p : { ...p, destaque: false }
    );
    const r = lista(semDestaque, { ordem: "mais-pedidos" });
    expect(r.maisPedidosDisponivel).toBe(false);
    expect(r.ordem).toBe("recomendados");
  });

  it("não depende da busca: continua disponível mesmo quando a busca não traz destaque", () => {
    const r = lista(CATALOGO, { busca: "empada" });
    expect(nomes(r)).toEqual(["Empada"]);
    expect(r.maisPedidosDisponivel).toBe(true);
  });

  it("numa categoria, ?ordem=mais-pedidos volta para Recomendados", () => {
    const r = lista(CATALOGO, { categoria: "Doces", ordem: "mais-pedidos" });
    expect(r.ordem).toBe("recomendados");
    expect(nomes(r)).toEqual(nomes(lista(CATALOGO, { categoria: "Doces" })));
  });

  it("trocar de 'Todos' para uma categoria estando em Mais pedidos: o link da categoria já vai em Recomendados", () => {
    // O filtro monta o link sem a ordem (FiltroCategorias); aqui a regra de
    // endereço: Recomendados não entra na URL.
    expect(urlDaLista({ categoria: "Doces", ordem: "recomendados" })).toBe("/produtos?categoria=doces");
  });
});

describe("Lista — ordem por nome", () => {
  it("A a Z: só alfabética, sem destaque no topo", () => {
    const r = lista(CATALOGO, { ordem: "a-z" });
    expect(nomes(r)).toEqual([
      "Beijinho",
      "Bento Amor",
      "Bento Flork",
      "Bolo de Cenoura",
      "Bolo de Chocolate",
      "Brigadeiro Gourmet",
      "Cento de salgados",
      "Empada",
      "Kit Básico",
      "Kit Festa",
      "Morango Banhado",
      "Pão de Mel",
      "Risole de carne",
    ]);
  });

  it("Z a A: o inverso exato de A a Z", () => {
    expect(nomes(lista(CATALOGO, { ordem: "z-a" }))).toEqual([...nomes(lista(CATALOGO, { ordem: "a-z" }))].reverse());
  });

  it("vale também dentro de uma categoria", () => {
    expect(nomes(lista(CATALOGO, { categoria: "Doces", ordem: "a-z" }))).toEqual(["Beijinho", "Brigadeiro Gourmet", "Morango Banhado", "Pão de Mel"]);
    expect(nomes(lista(CATALOGO, { categoria: "Doces", ordem: "z-a" }))).toEqual(["Pão de Mel", "Morango Banhado", "Brigadeiro Gourmet", "Beijinho"]);
  });

  it("acento e maiúscula não separam; número em ordem numérica", () => {
    const doces = ["Zebrinha", "Éclair", "bolo de pote", "açaí na tigela", "Abacaxi", "Refri 10L", "Refri 2L"].map((nome) =>
      produto({ nome, Categoria: "Doces" })
    );
    expect(nomes(lista(doces, { ordem: "a-z" }))).toEqual(["Abacaxi", "açaí na tigela", "bolo de pote", "Éclair", "Refri 2L", "Refri 10L", "Zebrinha"]);
  });
});

describe("Lista — selo 'Mais pedido'", () => {
  it("todo destaque mostrado tem selo, em qualquer ordem; os outros, não", () => {
    for (const ordem of ["recomendados", "mais-pedidos", "a-z", "z-a"] as const) {
      expect(comSelo(lista(CATALOGO, { ordem })).sort()).toEqual(
        ["Beijinho", "Bento Flork", "Bolo de Chocolate", "Brigadeiro Gourmet", "Cento de salgados", "Kit Básico"].sort()
      );
    }
  });
});

describe("Lista — busca", () => {
  it("só pelo nome, sem acento nem maiúscula: 'pao de mel' encontra 'Pão de Mel'", () => {
    expect(nomes(lista(CATALOGO, { busca: "pao de mel" }))).toEqual(["Pão de Mel"]);
    expect(nomes(lista(CATALOGO, { busca: "PÃO DE MEL" }))).toEqual(["Pão de Mel"]);
  });

  it("não procura na descrição nem na categoria", () => {
    const comDescricao = [produto({ nome: "Trufa", Categoria: "Doces", descricao: "Recheio de brigadeiro" })];
    expect(lista(comDescricao, { busca: "brigadeiro" }).total).toBe(0);
    expect(lista(CATALOGO, { busca: "salgados" }).total).toBe(1); // só "Cento de salgados", pelo nome
  });

  it("dentro da categoria escolhida", () => {
    expect(nomes(lista(CATALOGO, { categoria: "Bolos", busca: "bolo" }))).toEqual(["Bolo de Chocolate", "Bolo de Cenoura"]);
    expect(lista(CATALOGO, { categoria: "Doces", busca: "bolo" }).total).toBe(0);
  });

  it("não acha Adicional nem Bebida", () => {
    expect(lista(CATALOGO, { busca: "vela" }).total).toBe(0);
    expect(lista(CATALOGO, { busca: "coca" }).total).toBe(0);
  });

  it("sem resultado: total 0, mas a categoria tem produtos (a página mostra 'Limpar busca', não 'categoria vazia')", () => {
    const r = lista(CATALOGO, { busca: "pizza" });
    expect(r.total).toBe(0);
    expect(r.itens).toEqual([]);
    expect(r.temProdutosSemBusca).toBe(true);
    expect(r.pagina).toBe(1);
    expect(r.totalPaginas).toBe(1);
  });

  it("busca só com espaços vale como vazia", () => {
    const p = lerParametrosDaLista({ busca: "    " });
    expect(p.busca).toBe("");
    expect(nomes(lista(CATALOGO, p))).toEqual(nomes(lista(CATALOGO)));
  });

  it("aplica a ordem escolhida aos encontrados", () => {
    expect(nomes(lista(CATALOGO, { busca: "bolo", ordem: "z-a" }))).toEqual(["Bolo de Chocolate", "Bolo de Cenoura"]);
    expect(nomes(lista(CATALOGO, { busca: "bolo", ordem: "a-z" }))).toEqual(["Bolo de Cenoura", "Bolo de Chocolate"]);
  });
});

describe("Lista — paginação (24 por página)", () => {
  it(`${POR_PAGINA} por página: 50 produtos dão 3 páginas, com 24, 24 e 2`, () => {
    const cinquenta = muitos(50);
    expect(POR_PAGINA).toBe(24);
    const [p1, p2, p3] = [1, 2, 3].map((pagina) => lista(cinquenta, { pagina }));
    expect(p1.totalPaginas).toBe(3);
    expect(p1.itens).toHaveLength(24);
    expect(p2.itens).toHaveLength(24);
    expect(p3.itens).toHaveLength(2);
    expect(nomes(p1)[0]).toBe("Doce 001");
    expect(nomes(p2)[0]).toBe("Doce 025");
    expect(nomes(p3)).toEqual(["Doce 049", "Doce 050"]);
    expect(p1.total).toBe(50);
  });

  it("nenhum produto se repete nem some entre as páginas", () => {
    const cinquenta = muitos(50);
    const todas = [1, 2, 3].flatMap((pagina) => nomes(lista(cinquenta, { pagina })));
    expect(new Set(todas).size).toBe(50);
  });

  it("exatamente 24 dá 1 página; 25 dá 2", () => {
    expect(lista(muitos(24)).totalPaginas).toBe(1);
    expect(lista(muitos(25)).totalPaginas).toBe(2);
  });

  it("?pagina= maior que o total cai na última página válida", () => {
    const r = lista(muitos(50), { pagina: 99 });
    expect(r.pagina).toBe(3);
    expect(r.itens).toHaveLength(2);
  });

  it("?pagina= inválido (vazio, 0, negativo, fração, texto) cai na página 1", () => {
    for (const valor of ["", "0", "-1", "2,5", "2.5", "abc", "1e3", " ", "999999999999", undefined]) {
      expect(paginaDoParametro(valor), String(valor)).toBe(1);
    }
    expect(paginaDoParametro("2")).toBe(2);
    expect(paginaDoParametro(" 3 ")).toBe(3);
    expect(paginaDoParametro(["2", "5"])).toBe(2);
  });

  it("busca sem resultado com ?pagina=5: página 1 de 1, sem erro", () => {
    const r = lista(CATALOGO, { busca: "pizza", pagina: 5 });
    expect(r.pagina).toBe(1);
    expect(r.totalPaginas).toBe(1);
  });
});

describe("Lista — mudar filtro, busca ou ordem volta para a página 1", () => {
  // Os três controles montam o endereço novo sem a página (urlDaLista sem
  // `pagina`): aqui, a regra do endereço. Os links e o formulário são
  // conferidos em produtos/page.test.tsx.
  it("endereço sem página é a página 1", () => {
    const estando = { categoria: null, busca: "bolo", ordem: "a-z", pagina: 3 } as const;
    expect(urlDaLista({ ...estando, pagina: undefined })).toBe("/produtos?busca=bolo&ordem=a-z");
    expect(lerParametrosDaLista({ busca: "bolo", ordem: "a-z" }).pagina).toBe(1);
  });
});

describe("Lista — parâmetros da URL", () => {
  it("aceita as 5 categorias da Lista no formato de ROTAS.listaPorCategoria, sem diferenciar maiúscula", () => {
    expect(categoriaDoParametro("bolos")).toBe("Bolos");
    expect(categoriaDoParametro("doces")).toBe("Doces");
    expect(categoriaDoParametro("salgados")).toBe("Salgados");
    expect(categoriaDoParametro("kit-festa")).toBe("Kit Festa");
    expect(categoriaDoParametro("bento-cake")).toBe("Bento Cake");
    expect(categoriaDoParametro("KIT-FESTA")).toBe("Kit Festa");
  });

  it("categoria inexistente, vazia, ausente, adicionais ou bebidas: 'Todos' (null), sem erro", () => {
    for (const valor of ["adicionais", "bebidas", "kits-festa", "outros", "", "   ", "bolo", "<script>", undefined]) {
      expect(categoriaDoParametro(valor), String(valor)).toBeNull();
    }
  });

  it("parâmetro repetido usa o primeiro valor", () => {
    expect(categoriaDoParametro(["doces", "bolos"])).toBe("Doces");
    expect(categoriaDoParametro([])).toBeNull();
  });

  it("URL colada abre igual: todos os parâmetros juntos", () => {
    expect(lerParametrosDaLista({ categoria: "doces", busca: "  pão  de mel ", ordem: "z-a", pagina: "2" })).toEqual({
      categoria: "Doces",
      busca: "pão de mel",
      ordem: "z-a",
      pagina: 2,
    });
  });

  it("endereço montado: valor padrão fica de fora, ordem fixa dos parâmetros", () => {
    expect(urlDaLista({})).toBe("/produtos");
    expect(urlDaLista({ categoria: "Bento Cake", busca: "pão de mel", ordem: "mais-pedidos", pagina: 2 })).toBe(
      "/produtos?categoria=bento-cake&busca=p%C3%A3o+de+mel&ordem=mais-pedidos&pagina=2"
    );
    expect(urlDaLista({ busca: "   ", ordem: "recomendados", pagina: 1 })).toBe("/produtos");
  });

  it("o endereço montado volta ao mesmo estado quando lido", () => {
    const estado = { categoria: "Kit Festa", busca: "festa básica", ordem: "a-z", pagina: 2 } as const;
    const query = Object.fromEntries(new URLSearchParams(urlDaLista(estado).split("?")[1]));
    expect(lerParametrosDaLista(query)).toEqual(estado);
  });
});

describe("Lista — números da paginação", () => {
  it("até 7 páginas, todas", () => {
    expect(paginasVisiveis(1, 1)).toEqual([1]);
    expect(paginasVisiveis(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("mais de 7: primeira, última, atual e vizinhas, com reticências; nunca mais de 7 posições", () => {
    expect(paginasVisiveis(1, 9)).toEqual([1, 2, 3, 4, "…", 9]);
    expect(paginasVisiveis(5, 9)).toEqual([1, "…", 4, 5, 6, "…", 9]);
    expect(paginasVisiveis(9, 9)).toEqual([1, "…", 6, 7, 8, 9]);
    for (let atual = 1; atual <= 40; atual++) {
      const p = paginasVisiveis(atual, 40);
      expect(p.length).toBeLessThanOrEqual(7);
      expect(p).toContain(atual);
      expect(p[0]).toBe(1);
      expect(p.at(-1)).toBe(40);
    }
  });
});
