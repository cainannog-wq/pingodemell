import { describe, expect, it } from "vitest";
import { CATEGORIAS, categoriaCanonica, categoriaDoValor } from "@/lib/produtos/categorias";
import { TILES_CATEGORIA } from "@/lib/site/config";
import { categoriaParaParametro, ROTAS, urlDaLista } from "@/lib/site/rotas";
import { SEO_CATEGORIAS } from "@/lib/site/seo";
import { montarSitemap } from "@/lib/site/sitemap";
import {
  categoriaDoParametro,
  categoriaDoParametroAntigo,
  categoriaEstaNaLista,
  montarLista,
  type ParametrosLista,
} from "./lista";
import { ehMaisPedido, type ProdutoVitrine } from "./mais-pedidos";

// Categoria "Kits" renomeada para "Kit Festa" (PR categoria/kit-festa). O
// código reconhece os dois nomes como a mesma categoria enquanto o RENAME do
// enum não é aplicado, e se ele for desfeito. Nenhum teste lê ou altera o
// banco: as linhas são simuladas nos dois estados.

const NOME_NOVO = "Kit Festa" as ProdutoVitrine["Categoria"];
const NOME_ANTIGO = "Kits" as unknown as ProdutoVitrine["Categoria"];

let seq = 0;
function produto(parcial: Partial<ProdutoVitrine>): ProdutoVitrine {
  seq += 1;
  return {
    id: `id-${seq}`,
    slug: `kit-${seq}`,
    nome: `Kit ${String(seq).padStart(3, "0")}`,
    descricao: null,
    preco: 10,
    image_url: null,
    Categoria: "Doces",
    tipo: "normal",
    unidade_venda: "kit",
    pedido_minimo: 10,
    step_quantidade: "livre",
    ativo: true,
    destaque: false,
    atualizado_em: "2026-09-23T14:29:18.070Z",
    ...parcial,
  };
}

// 44 kits ativos e 2 inativos, como no banco em 12/10/2026.
function kits(categoria: ProdutoVitrine["Categoria"]): ProdutoVitrine[] {
  return [
    ...Array.from({ length: 44 }, () => produto({ Categoria: categoria })),
    ...Array.from({ length: 2 }, () => produto({ Categoria: categoria, ativo: false })),
  ];
}

const TODOS: ParametrosLista = { categoria: null, busca: "", ordem: "recomendados", pagina: 1 };
const KIT_FESTA: ParametrosLista = { ...TODOS, categoria: "Kit Festa" };

describe.each([
  ["Kit Festa (depois do RENAME)", NOME_NOVO],
  ["Kits (antes do RENAME, ou depois de desfeito)", NOME_ANTIGO],
])("Kit Festa com os produtos em %s", (_estado, categoria) => {
  const produtos = kits(categoria);

  it("'Todos' e o filtro mostram os 44 ativos (24 + 20 em duas páginas)", () => {
    for (const parametros of [TODOS, KIT_FESTA]) {
      const p1 = montarLista(produtos, parametros);
      const p2 = montarLista(produtos, { ...parametros, pagina: 2 });
      expect(p1.total).toBe(44);
      expect(p1.itens).toHaveLength(24);
      expect(p2.itens).toHaveLength(20);
    }
  });

  it("a categoria entra na Lista e no sitemap", () => {
    expect(categoriaEstaNaLista(categoria)).toBe(true);
    const xml = montarSitemap([{ slug: "kit-a", Categoria: categoria, atualizado_em: "2026-09-23T14:29:18.070Z" }]);
    expect(xml).toContain("/produtos?categoria=kit-festa");
    expect(xml).not.toContain("categoria=kits");
  });

  it("o selo 'Mais pedido' vale para o kit em destaque", () => {
    expect(ehMaisPedido({ destaque: true, Categoria: categoria })).toBe(true);
  });

  it("a ordem Recomendados em 'Todos' põe os kits entre Salgados e Bento Cake", () => {
    const misto = [
      produto({ nome: "Bento", Categoria: "Bento Cake", tipo: "bento_cake" }),
      produto({ nome: "Kit", Categoria: categoria }),
      produto({ nome: "Salgado", Categoria: "Salgados" }),
    ];
    expect(montarLista(misto, TODOS).itens.map((i) => i.produto.nome)).toEqual(["Salgado", "Kit", "Bento"]);
  });
});

describe("Kit Festa — nome, parâmetro, tile e SEO", () => {
  it("o parâmetro de URL é exatamente 'kit-festa', nos dois estados", () => {
    expect(categoriaParaParametro("Kit Festa")).toBe("kit-festa");
    expect(categoriaParaParametro(NOME_ANTIGO as NonNullable<typeof NOME_ANTIGO>)).toBe("kit-festa");
    expect(ROTAS.listaPorCategoria("Kit Festa")).toBe("/produtos?categoria=kit-festa");
    expect(urlDaLista({ categoria: "Kit Festa" })).toBe("/produtos?categoria=kit-festa");
    expect(categoriaDoParametro("kit-festa")).toBe("Kit Festa");
  });

  it("'Kits' e 'Kit Festa' são a mesma categoria; valor desconhecido continua desconhecido", () => {
    expect(categoriaCanonica("Kits")).toBe("Kit Festa");
    expect(categoriaCanonica("Kit Festa")).toBe("Kit Festa");
    expect(categoriaCanonica("kits")).toBeNull();
    expect(categoriaCanonica("Outra")).toBeNull();
    expect(categoriaCanonica(null)).toBeNull();
    expect(categoriaDoValor("Kits")?.parametro).toBe("kit-festa");
  });

  it("a lista única só tem o nome novo, na mesma posição de antes", () => {
    expect(CATEGORIAS.map((c) => c.valor)).toEqual(["Bolos", "Bento Cake", "Doces", "Salgados", "Bebidas", "Kit Festa", "Adicionais"]);
  });

  it("o parâmetro antigo não vale como filtro, mas é reconhecido para o redirecionamento", () => {
    expect(categoriaDoParametro("kits")).toBeNull();
    expect(categoriaDoParametroAntigo("kits")).toBe("Kit Festa");
    expect(categoriaDoParametroAntigo("KITS")).toBe("Kit Festa");
    expect(categoriaDoParametroAntigo(["kits", "x"])).toBe("Kit Festa");
    for (const v of ["kit-festa", "kits-festa", "doces", "", undefined]) expect(categoriaDoParametroAntigo(v), String(v)).toBeNull();
  });

  it("o tile da Home é Kit Festa, com a foto e o alt 'Kit Festa'", () => {
    const tile = TILES_CATEGORIA.find((t) => t.categoria === "Kit Festa");
    expect(tile).toMatchObject({ rotulo: "Kit Festa", imagem: "/fotos/cat-kits.webp", alt: "Kit Festa" });
    expect(TILES_CATEGORIA.some((t) => String(t.categoria) === "Kits")).toBe(false);
  });

  it("título e descrição de SEO aprovados", () => {
    expect(SEO_CATEGORIAS["Kit Festa"].titulo).toBe("Kit Festa em Fazenda Rio Grande e Curitiba | Pingo de Mell");
    expect(SEO_CATEGORIAS["Kit Festa"].descricao).toBe(
      "Kit Festa para aniversário, escola e casamento, com doces e salgados artesanais em Fazenda Rio Grande e Curitiba. Peça pelo WhatsApp."
    );
  });
});
