import { describe, expect, it } from "vitest";
import { categoriaParaParametro } from "@/lib/site/rotas";
import { categoriaDoParametro } from "@/lib/vitrine/lista";
import { ehMaisPedido } from "@/lib/vitrine/mais-pedidos";
import { CATEGORIA_VALUES, CATEGORIAS, categoriaDoValor, type CategoriaProduto } from "./categorias";

// Lista única das categorias (PR fase4/categorias-novas). A conferência com
// o enum do banco fica em scripts/banco/categoria.mjs (categoria 8).

describe("lista única de categorias", () => {
  it("7 categorias, na ordem de exibição, com Adicionais no fim", () => {
    expect(CATEGORIA_VALUES).toEqual(["Bolos", "Bento Cake", "Doces", "Salgados", "Bebidas", "Kits", "Adicionais"]);
  });

  it("valores, rótulos e valores na URL sem repetição", () => {
    for (const campo of ["valor", "rotulo", "parametro"] as const) {
      const lista = CATEGORIAS.map((c) => c[campo]);
      expect(new Set(lista).size, campo).toBe(lista.length);
    }
  });

  it("valor na URL só com a-z e hífen (sem acento nem espaço)", () => {
    for (const c of CATEGORIAS) expect(c.parametro, c.valor).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });

  it("as 6 categorias de antes mantêm o valor na URL de antes (links compartilhados)", () => {
    const antes: Record<string, string> = {
      Bolos: "bolos",
      "Bento Cake": "bento-cake",
      Doces: "doces",
      Salgados: "salgados",
      Bebidas: "bebidas",
      Kits: "kits",
    };
    for (const [valor, parametro] of Object.entries(antes)) {
      expect(categoriaParaParametro(valor as CategoriaProduto)).toBe(parametro);
    }
    expect(categoriaParaParametro("Adicionais")).toBe("adicionais");
  });

  it("ida e volta: cada valor na URL leva de volta à categoria", () => {
    for (const c of CATEGORIAS) expect(categoriaDoParametro(c.parametro)).toBe(c.valor);
  });

  it("só Bebidas e Adicionais ficam fora de 'Os mais pedidos'", () => {
    expect(CATEGORIAS.filter((c) => !c.entraEmMaisPedidos).map((c) => c.valor)).toEqual(["Bebidas", "Adicionais"]);
    for (const c of CATEGORIAS) {
      expect(ehMaisPedido({ destaque: true, Categoria: c.valor }), c.valor).toBe(c.entraEmMaisPedidos);
    }
  });

  it("valor desconhecido vindo do banco não lança erro: sem registro, URL pela regra antiga, conta em 'Os mais pedidos'", () => {
    const futuro = "Categoria Futura" as CategoriaProduto;
    expect(categoriaDoValor(futuro)).toBeUndefined();
    expect(categoriaDoValor(null)).toBeUndefined();
    expect(categoriaParaParametro(futuro)).toBe("categoria-futura");
    expect(categoriaDoParametro("categoria-futura")).toBeNull();
    expect(ehMaisPedido({ destaque: true, Categoria: futuro })).toBe(true);
    expect(ehMaisPedido({ destaque: true, Categoria: null })).toBe(true);
  });
});
