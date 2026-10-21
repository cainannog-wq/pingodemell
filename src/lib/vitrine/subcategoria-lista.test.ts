import { describe, expect, it } from "vitest";
import { urlDaLista } from "@/lib/site/rotas";
import type { Subcategoria } from "@/lib/subcategorias/types";
import {
  POR_PAGINA,
  chipsDaCategoria,
  lerParametrosDaLista,
  montarLista,
  opcoesDeSubcategoria,
  subcategoriaDoParametro,
  urlDaSubcategoria,
  type ParametrosLista,
} from "./lista";
import type { ProdutoVitrine } from "./mais-pedidos";

// Dado simulado: nenhum destes testes lê ou altera o banco.
let seq = 0;
function produto(parcial: Partial<ProdutoVitrine>): ProdutoVitrine {
  seq += 1;
  return {
    id: `p-${seq}`,
    slug: `produto-${seq}`,
    nome: `Produto ${String(seq).padStart(3, "0")}`,
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

function sub(parcial: Partial<Subcategoria> & Pick<Subcategoria, "id" | "nome" | "slug" | "categoria">): Subcategoria {
  return { ordem: 10, ativo: true, ...parcial };
}

const GOURMET = sub({ id: "s-gourmet", categoria: "Doces", nome: "Gourmet Premium", slug: "gourmet-premium", ordem: 20 });
const FINOS = sub({ id: "s-finos", categoria: "Doces", nome: "Finos", slug: "finos", ordem: 10 });
const VAZIA = sub({ id: "s-vazia", categoria: "Doces", nome: "Vazia", slug: "vazia", ordem: 5 });
const INATIVA = sub({ id: "s-inativa", categoria: "Doces", nome: "Inativa", slug: "inativa", ordem: 1, ativo: false });
const PREMIUM_KIT = sub({ id: "s-premium-kit", categoria: "Kit Festa", nome: "Premium", slug: "premium" });
// Mesmo slug "premium" em outra categoria (o slug só é único por categoria).
const PREMIUM_DOCES = sub({ id: "s-premium-doces", categoria: "Doces", nome: "Premium", slug: "premium", ordem: 30 });
const SMASH = sub({ id: "s-smash", categoria: "Bolos", nome: "Smash Cake", slug: "smash-cake" });
const SUBS = [GOURMET, FINOS, VAZIA, INATIVA, PREMIUM_KIT, PREMIUM_DOCES, SMASH];

const CATALOGO: ProdutoVitrine[] = [
  produto({ nome: "Brigadeiro Gourmet", subcategoria_id: GOURMET.id }),
  produto({ nome: "Beijinho Gourmet", subcategoria_id: GOURMET.id, destaque: true }),
  produto({ nome: "Éclair Fino", subcategoria_id: FINOS.id }),
  produto({ nome: "Doce Premium", subcategoria_id: PREMIUM_DOCES.id }),
  produto({ nome: "Doce Sem Subcategoria" }),
  produto({ nome: "Doce Inativo na Sub", subcategoria_id: VAZIA.id, ativo: false }),
  produto({ nome: "Doce em Sub Inativa", subcategoria_id: INATIVA.id }),
  produto({ nome: "Kit Premium A", Categoria: "Kit Festa", subcategoria_id: PREMIUM_KIT.id }),
  produto({ nome: "Kit Premium B", Categoria: "Kit Festa", subcategoria_id: PREMIUM_KIT.id }),
  produto({ nome: "Kit Antigo", Categoria: "Kits" as ProdutoVitrine["Categoria"], subcategoria_id: PREMIUM_KIT.id }),
  produto({ nome: "Smash Cake Safári", Categoria: "Bolos", subcategoria_id: SMASH.id }),
  produto({ nome: "Bolo Comum", Categoria: "Bolos" }),
  // Adicionais fica fora da Lista, mesmo com subcategoria.
  produto({ nome: "Vela", Categoria: "Adicionais", subcategoria_id: "s-adicional" }),
];

const BASE: ParametrosLista = { categoria: null, subcategoria: null, busca: "", ordem: "recomendados", pagina: 1 };
const lista = (p: Partial<ParametrosLista> = {}, produtos = CATALOGO, subs: Subcategoria[] = SUBS) =>
  montarLista(produtos, { ...BASE, ...p }, subs);
const nomes = (r: ReturnType<typeof lista>) => r.itens.map((i) => i.produto.nome);

describe("subcategoriaDoParametro", () => {
  it("minúsculas, sem espaço nas pontas, string ou null", () => {
    expect(subcategoriaDoParametro(" Gourmet-Premium ")).toBe("gourmet-premium");
    expect(subcategoriaDoParametro(["finos", "outro"])).toBe("finos");
    expect(subcategoriaDoParametro(undefined)).toBeNull();
    expect(subcategoriaDoParametro("   ")).toBeNull();
    expect(subcategoriaDoParametro("a".repeat(81))).toBeNull();
  });

  it("lerParametrosDaLista guarda o slug cru, sem olhar a categoria", () => {
    expect(lerParametrosDaLista({ subcategoria: "Finos" }).subcategoria).toBe("finos");
    expect(lerParametrosDaLista({ categoria: "kits", subcategoria: "premium" })).toMatchObject({
      categoria: null,
      subcategoria: "premium",
    });
  });
});

describe("filtro por subcategoria — montarLista", () => {
  it("slug válido filtra a categoria e marca o chip ativo", () => {
    const r = lista({ categoria: "Doces", subcategoria: "gourmet-premium" });
    expect(r.subcategoriaAtiva).toBe("gourmet-premium");
    expect(nomes(r)).toEqual(["Beijinho Gourmet", "Brigadeiro Gourmet"]);
    expect(r.total).toBe(2);
    expect(r.temProdutosSemBusca).toBe(true);
  });

  it("em maiúscula ou com espaço (via lerParametrosDaLista) vale", () => {
    const p = lerParametrosDaLista({ categoria: "doces", subcategoria: "  FINOS " });
    const r = montarLista(CATALOGO, p, SUBS);
    expect(r.subcategoriaAtiva).toBe("finos");
    expect(nomes(r)).toEqual(["Éclair Fino"]);
  });

  it("slug em maiúscula direto em montarLista (sem normalizar) não casa: a normalização é da leitura", () => {
    expect(lista({ categoria: "Doces", subcategoria: "FINOS" }).subcategoriaAtiva).toBeNull();
    expect(lista({ categoria: "Doces", subcategoria: " finos" }).subcategoriaAtiva).toBeNull();
  });

  it.each([
    ["inexistente", "inexistente"],
    ["de outra categoria", "smash-cake"],
    ["inativa", "inativa"],
    ["sem produto da Lista (só produto inativo)", "vazia"],
  ])("slug %s vale como 'Todas', sem erro", (_nome, slug) => {
    const todas = lista({ categoria: "Doces" });
    const r = lista({ categoria: "Doces", subcategoria: slug });
    expect(r.subcategoriaAtiva).toBeNull();
    expect(nomes(r)).toEqual(nomes(todas));
    expect(r.total).toBe(todas.total);
  });

  it("sem categoria o parâmetro é ignorado e não há chips", () => {
    const r = lista({ categoria: null, subcategoria: "finos" });
    expect(r.subcategoriaAtiva).toBeNull();
    expect(r.chips).toEqual([]);
    expect(r.total).toBe(lista().total);
  });

  it("slug repetido entre categorias resolve pela categoria escolhida", () => {
    const doces = lista({ categoria: "Doces", subcategoria: "premium" });
    expect(nomes(doces)).toEqual(["Doce Premium"]);
    const kits = lista({ categoria: "Kit Festa", subcategoria: "premium" });
    expect(nomes(kits)).toEqual(["Kit Antigo", "Kit Premium A", "Kit Premium B"]);
  });

  it("categoria antiga 'Kits' casa pelo nome canônico, na subcategoria e no produto", () => {
    const antiga = [{ ...PREMIUM_KIT, categoria: "Kits" as Subcategoria["categoria"] }];
    const r = lista({ categoria: "Kit Festa", subcategoria: "premium" }, CATALOGO, antiga);
    expect(r.chips.map((c) => c.slug)).toEqual(["premium"]);
    expect(r.total).toBe(3);
  });

  it("soma com busca e com ordem", () => {
    const comBusca = lista({ categoria: "Doces", subcategoria: "gourmet-premium", busca: "beijinho" });
    expect(nomes(comBusca)).toEqual(["Beijinho Gourmet"]);
    const az = lista({ categoria: "Doces", subcategoria: "gourmet-premium", ordem: "a-z" });
    expect(nomes(az)).toEqual(["Beijinho Gourmet", "Brigadeiro Gourmet"]);
    const za = lista({ categoria: "Doces", subcategoria: "gourmet-premium", ordem: "z-a" });
    expect(nomes(za)).toEqual(["Brigadeiro Gourmet", "Beijinho Gourmet"]);
  });

  it("busca sem resultado dentro da subcategoria: o vazio vem da busca, não da categoria", () => {
    const r = lista({ categoria: "Doces", subcategoria: "gourmet-premium", busca: "zzzz" });
    expect(r.total).toBe(0);
    expect(r.temProdutosSemBusca).toBe(true);
    expect(r.subcategoriaAtiva).toBe("gourmet-premium");
  });

  it("paginação dentro de uma subcategoria grande; página fora do intervalo vai para a última", () => {
    const grande = Array.from({ length: 30 }, (_, i) =>
      produto({ nome: `Fino ${String(i + 1).padStart(2, "0")}`, subcategoria_id: FINOS.id })
    );
    const todos = [...grande, produto({ nome: "Fora da sub", subcategoria_id: GOURMET.id })];
    const base = { categoria: "Doces" as const, subcategoria: "finos", ordem: "a-z" as const };
    const p1 = lista(base, todos);
    expect(p1.total).toBe(30);
    expect(p1.totalPaginas).toBe(2);
    expect(p1.itens).toHaveLength(POR_PAGINA);
    const p2 = lista({ ...base, pagina: 2 }, todos);
    expect(nomes(p2)).toEqual(["Fino 25", "Fino 26", "Fino 27", "Fino 28", "Fino 29", "Fino 30"]);
    const p9 = lista({ ...base, pagina: 9 }, todos);
    expect(p9.pagina).toBe(2);
    expect(nomes(p9)).toEqual(nomes(p2));
  });
});

describe("chips", () => {
  it("só subcategorias ativas da categoria com produto da Lista, por ordem e depois nome", () => {
    const r = lista({ categoria: "Doces" });
    // Finos (10), Gourmet Premium (20), Premium (30); Vazia (só produto inativo) e Inativa somem.
    expect(r.chips.map((c) => c.slug)).toEqual(["finos", "gourmet-premium", "premium"]);
  });

  it("desempate por nome quando a ordem é igual", () => {
    const a = sub({ id: "a", categoria: "Doces", nome: "Zeta", slug: "zeta", ordem: 10 });
    const b = sub({ id: "b", categoria: "Doces", nome: "Alfa", slug: "alfa", ordem: 10 });
    const ps = [produto({ subcategoria_id: "a" }), produto({ subcategoria_id: "b" })];
    expect(chipsDaCategoria("Doces", ps, [a, b]).map((c) => c.slug)).toEqual(["alfa", "zeta"]);
  });

  it("subcategoria de 1 produto aparece (Smash Cake)", () => {
    expect(lista({ categoria: "Bolos" }).chips.map((c) => c.slug)).toEqual(["smash-cake"]);
  });

  it("não dependem da busca (não somem enquanto a cliente busca)", () => {
    expect(lista({ categoria: "Doces", busca: "zzzz" }).chips).toHaveLength(3);
  });

  it("categoria sem subcategoria com produto não tem chips", () => {
    expect(lista({ categoria: "Salgados" }).chips).toEqual([]);
    expect(lista({ categoria: "Bento Cake" }).chips).toEqual([]);
  });

  it("sem a lista de subcategorias (leitura falhou) a Lista funciona como antes", () => {
    const r = montarLista(CATALOGO, { ...BASE, categoria: "Doces", subcategoria: "finos" });
    expect(r.chips).toEqual([]);
    expect(r.subcategoriaAtiva).toBeNull();
    expect(r.total).toBe(lista({ categoria: "Doces" }, CATALOGO, []).total);
  });
});

describe("URLs do filtro", () => {
  it("ordem dos parâmetros: categoria, subcategoria, busca, ordem, pagina", () => {
    expect(urlDaLista({ categoria: "Doces", subcategoria: "finos", busca: "ba", ordem: "a-z", pagina: 2 })).toBe(
      "/produtos?categoria=doces&subcategoria=finos&busca=ba&ordem=a-z&pagina=2"
    );
  });

  it("subcategoria sem categoria não entra na URL", () => {
    expect(urlDaLista({ subcategoria: "finos" })).toBe("/produtos");
  });

  it("trocar a subcategoria mantém busca e ordem e volta à página 1", () => {
    const parametros = { categoria: "Doces" as const, busca: "ba", ordem: "a-z" as const };
    expect(urlDaSubcategoria(parametros, "finos")).toBe("/produtos?categoria=doces&subcategoria=finos&busca=ba&ordem=a-z");
    expect(urlDaSubcategoria(parametros, "finos")).not.toContain("pagina");
  });

  it("'Todas' remove só a subcategoria e mantém busca e ordem", () => {
    expect(urlDaSubcategoria({ categoria: "Doces", busca: "ba", ordem: "a-z" }, null)).toBe(
      "/produtos?categoria=doces&busca=ba&ordem=a-z"
    );
  });

  it("trocar a categoria remove a subcategoria (urlDaLista sem ela)", () => {
    expect(urlDaLista({ categoria: "Salgados", busca: "ba", ordem: "a-z" })).toBe("/produtos?categoria=salgados&busca=ba&ordem=a-z");
  });

  it("o 308 de 'kits' preserva o slug: categoria ainda nula, subcategoria crua", () => {
    const cru = lerParametrosDaLista({ categoria: "kits", subcategoria: "Premium", busca: "kit" });
    expect(cru.categoria).toBeNull();
    expect(urlDaLista({ ...cru, categoria: "Kit Festa" })).toBe("/produtos?categoria=kit-festa&subcategoria=premium&busca=kit");
  });
});

describe("Kit Festa: Por pessoa primeiro", () => {
  const BASICO = sub({ id: "k-basico", categoria: "Kit Festa", nome: "Básico", slug: "basico", ordem: 10 });
  const ESCOLAR = sub({ id: "k-escolar", categoria: "Kit Festa", nome: "Escolar", slug: "escolar", ordem: 40 });
  const POR_PESSOA = sub({ id: "k-pp", categoria: "Kit Festa", nome: "Por pessoa", slug: "por-pessoa", ordem: 70 });
  const kit = (sid: string) => produto({ Categoria: "Kit Festa", subcategoria_id: sid });
  const ps = [kit(BASICO.id), kit(ESCOLAR.id), kit(POR_PESSOA.id)];

  it("abre a lista do Kit Festa, mesmo cadastrada por último, e 'Todos' fica no fim", () => {
    const chips = chipsDaCategoria("Kit Festa", ps, [BASICO, ESCOLAR, POR_PESSOA]);
    expect(chips.map((c) => c.slug)).toEqual(["por-pessoa", "basico", "escolar"]);
    const opcoes = opcoesDeSubcategoria({ categoria: "Kit Festa", busca: "", ordem: "recomendados" }, chips, null);
    expect(opcoes.map((o) => o.nome)).toEqual(["Por pessoa", "Básico", "Escolar", "Todos"]);
  });

  it("sem produto em Por pessoa, ela não aparece e a ordem cadastrada vale", () => {
    const chips = chipsDaCategoria("Kit Festa", [kit(BASICO.id), kit(ESCOLAR.id)], [BASICO, ESCOLAR, POR_PESSOA]);
    expect(chips.map((c) => c.slug)).toEqual(["basico", "escolar"]);
  });

  it("outras categorias não mudam", () => {
    const chips = chipsDaCategoria("Doces", [produto({ subcategoria_id: GOURMET.id }), produto({ subcategoria_id: FINOS.id })], [GOURMET, FINOS]);
    expect(chips.map((c) => c.slug)).toEqual(["finos", "gourmet-premium"]);
  });
});

describe("opções do filtro e categorias com filtro (acordeão do desktop)", () => {
  it("'Todos' vem por último, depois dos chips; só a ativa é atual; endereços mantêm busca e ordem, sem página", () => {
    const r = lista({ categoria: "Doces", subcategoria: "finos" });
    const opcoes = opcoesDeSubcategoria({ categoria: "Doces", busca: "e", ordem: "a-z" }, r.chips, r.subcategoriaAtiva);
    expect(opcoes.map((o) => o.nome)).toEqual(["Finos", "Gourmet Premium", "Premium", "Todos"]);
    expect(opcoes.map((o) => o.atual)).toEqual([true, false, false, false]);
    expect(opcoes.map((o) => o.href)).toEqual([
      "/produtos?categoria=doces&subcategoria=finos&busca=e&ordem=a-z",
      "/produtos?categoria=doces&subcategoria=gourmet-premium&busca=e&ordem=a-z",
      "/produtos?categoria=doces&subcategoria=premium&busca=e&ordem=a-z",
      "/produtos?categoria=doces&busca=e&ordem=a-z",
    ]);
  });

  it("sem subcategoria ativa (ou inválida), 'Todos' é o atual", () => {
    const r = lista({ categoria: "Doces", subcategoria: "lixo" });
    const opcoes = opcoesDeSubcategoria({ categoria: "Doces", busca: "", ordem: "recomendados" }, r.chips, r.subcategoriaAtiva);
    expect(opcoes.find((o) => o.atual)?.nome).toBe("Todos");
  });

  it("categoriasComFiltro: as da Lista que têm chip, na ordem da Lista, em qualquer categoria escolhida", () => {
    for (const categoria of [null, "Doces", "Salgados", "Bento Cake"] as const) {
      expect(lista({ categoria }).categoriasComFiltro).toEqual(["Bolos", "Doces", "Kit Festa"]);
    }
  });

  it("categoriasComFiltro não conta subcategoria inativa, vazia nem sem a lista de subcategorias", () => {
    expect(lista({}, CATALOGO, [INATIVA, VAZIA]).categoriasComFiltro).toEqual([]);
    expect(montarLista(CATALOGO, BASE).categoriasComFiltro).toEqual([]);
  });
});
