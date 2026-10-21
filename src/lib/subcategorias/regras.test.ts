import { describe, expect, it } from "vitest";
import { mensagemEmUso, traduzirErroSubcategoria } from "./erros";
import { parseCategoriaSubcategoria, parseNomeSubcategoria } from "./parse";
import {
  agruparPorCategoria,
  opcoesDoSeletor,
  ordenarSubcategorias,
  planejarOrdem,
  recusaDaSubcategoria,
  temSubcategoriaParaEscolher,
} from "./regras";
import type { SubcategoriaOpcao } from "./types";

const l = (id: string, nome: string, ordem: number) => ({ id, nome, ordem });

describe("ordem e agrupamento", () => {
  it("ordena por ordem e, no empate, pelo nome", () => {
    const r = ordenarSubcategorias([l("c", "Zeta", 10), l("a", "Alfa", 20), l("b", "Beta", 10)]);
    expect(r.map((x) => x.id)).toEqual(["b", "c", "a"]);
  });

  it("agrupa nas 7 categorias, na ordem da lista única, inclusive as vazias", () => {
    const grupos = agruparPorCategoria([{ ...l("a", "Tradicional", 10), categoria: "Bolos" }]);
    expect(grupos.map((g) => g.categoria)).toEqual(["Bolos", "Bento Cake", "Doces", "Salgados", "Bebidas", "Kit Festa", "Adicionais"]);
    expect(grupos[0].itens).toHaveLength(1);
    expect(grupos.slice(1).every((g) => g.itens.length === 0)).toBe(true);
  });
});

describe("planejarOrdem (reordenar arrastando)", () => {
  const l = (id: string, nome: string, ordem: number) => ({ id, nome, ordem });
  const dezEmDez = [l("a", "A", 10), l("b", "B", 20), l("c", "C", 30)];

  it("grava só as linhas cujo ordem muda, de 10 em 10", () => {
    expect(planejarOrdem(dezEmDez, ["b", "a", "c"])).toEqual([
      { id: "b", ordem: 10 },
      { id: "a", ordem: 20 },
    ]);
    expect(planejarOrdem(dezEmDez, ["c", "a", "b"])).toEqual([
      { id: "c", ordem: 10 },
      { id: "a", ordem: 20 },
      { id: "b", ordem: 30 },
    ]);
  });

  it("a mesma ordem não grava nada", () => {
    expect(planejarOrdem(dezEmDez, ["a", "b", "c"])).toEqual([]);
  });

  it("ids que não cobrem exatamente as linhas (repetido, faltando, sobrando, desconhecido): null", () => {
    expect(planejarOrdem(dezEmDez, ["a", "b"])).toBeNull();
    expect(planejarOrdem(dezEmDez, ["a", "a", "b"])).toBeNull();
    expect(planejarOrdem(dezEmDez, ["a", "b", "x"])).toBeNull();
    expect(planejarOrdem(dezEmDez, ["a", "b", "c", "d"])).toBeNull();
  });

  it("partindo de empate e números tortos, o resultado sai sem empate", () => {
    const r = planejarOrdem([l("a", "A", 10), l("b", "B", 10), l("c", "C", 20)], ["c", "b", "a"]) ?? [];
    const final = new Map([["a", 10], ["b", 10], ["c", 20]]);
    for (const m of r) final.set(m.id, m.ordem);
    expect([final.get("c"), final.get("b"), final.get("a")]).toEqual([10, 20, 30]);
  });
});

describe("seletor de subcategoria do produto", () => {
  const linhas: SubcategoriaOpcao[] = [
    { id: "d1", categoria: "Doces", nome: "Gourmet", ativo: true, ordem: 20 },
    { id: "d2", categoria: "Doces", nome: "Antiga", ativo: false, ordem: 10 },
    { id: "s1", categoria: "Salgados", nome: "Fritos", ativo: false, ordem: 10 },
    { id: "b1", categoria: "Bolos", nome: "Tradicional", ativo: true, ordem: 10 },
  ];

  it("tem para escolher: alguma ativa na categoria", () => {
    expect(temSubcategoriaParaEscolher(linhas, "Doces")).toBe(true);
    expect(temSubcategoriaParaEscolher(linhas, "Bolos")).toBe(true);
  });

  it("não tem: só inativa e sem vínculo, ou categoria sem nenhuma", () => {
    expect(temSubcategoriaParaEscolher(linhas, "Salgados")).toBe(false);
    expect(temSubcategoriaParaEscolher(linhas, "Adicionais")).toBe(false);
    expect(temSubcategoriaParaEscolher(linhas, "")).toBe(false);
    expect(temSubcategoriaParaEscolher(linhas, null)).toBe(false);
  });

  it("vínculo a uma subcategoria inativa da categoria salva mantém o campo visível", () => {
    expect(temSubcategoriaParaEscolher(linhas, "Salgados", { subcategoriaId: "s1", categoriaSalva: "Salgados" })).toBe(true);
  });

  it("o vínculo só conta quando a categoria escolhida é a salva", () => {
    expect(temSubcategoriaParaEscolher(linhas, "Salgados", { subcategoriaId: "s1", categoriaSalva: "Doces" })).toBe(false);
  });

  it("aceita o nome antigo do banco (Kits) como Kit Festa", () => {
    const kit: SubcategoriaOpcao[] = [{ id: "k1", categoria: "Kit Festa", nome: "Básico", ativo: true, ordem: 10 }];
    expect(temSubcategoriaParaEscolher(kit, "Kit Festa")).toBe(true);
    expect(opcoesDoSeletor(kit, "Kits")).toEqual([{ id: "k1", rotulo: "Básico" }]);
  });

  it("opções: só a categoria escolhida, só as ativas, mais a atual inativa marcada", () => {
    expect(opcoesDoSeletor(linhas, "Doces")).toEqual([{ id: "d1", rotulo: "Gourmet" }]);
    expect(opcoesDoSeletor(linhas, "Doces", { subcategoriaId: "d2", categoriaSalva: "Doces" })).toEqual([
      { id: "d2", rotulo: "Antiga (inativa)" },
      { id: "d1", rotulo: "Gourmet" },
    ]);
    expect(opcoesDoSeletor(linhas, "Bolos", { subcategoriaId: "d2", categoriaSalva: "Doces" })).toEqual([
      { id: "b1", rotulo: "Tradicional" },
    ]);
  });
});

describe("recusa do servidor", () => {
  const daCategoria = [
    { id: "a", ativo: true },
    { id: "i", ativo: false },
  ];

  it("recusa id que não é da categoria", () => {
    expect(recusaDaSubcategoria("x", daCategoria, "Doces")).toMatch(/não pertence à categoria/);
  });

  it("recusa inativa, salvo a que o produto já tem na mesma categoria", () => {
    expect(recusaDaSubcategoria("i", daCategoria, "Doces")).toMatch(/desativada/);
    expect(recusaDaSubcategoria("i", daCategoria, "Doces", { subcategoriaId: "i", categoriaSalva: "Doces" })).toBeNull();
    expect(recusaDaSubcategoria("i", daCategoria, "Doces", { subcategoriaId: "i", categoriaSalva: "Bolos" })).toMatch(/desativada/);
  });

  it("aceita ativa", () => {
    expect(recusaDaSubcategoria("a", daCategoria, "Doces")).toBeNull();
  });
});

describe("nome, categoria e mensagens de erro", () => {
  it("nome: tira espaço das pontas, junta os repetidos e recusa vazio e acima de 80", () => {
    expect(parseNomeSubcategoria("  Doces   finos ")).toEqual({ success: true, data: "Doces finos" });
    expect(parseNomeSubcategoria("   ")).toMatchObject({ success: false });
    expect(parseNomeSubcategoria(undefined)).toMatchObject({ success: false });
    expect(parseNomeSubcategoria("a".repeat(80)).success).toBe(true);
    expect(parseNomeSubcategoria("a".repeat(81))).toMatchObject({ success: false });
  });

  it("categoria: só as 7 da lista única", () => {
    expect(parseCategoriaSubcategoria("Kit Festa")).toEqual({ success: true, data: "Kit Festa" });
    expect(parseCategoriaSubcategoria("Bebidas").success).toBe(true);
    expect(parseCategoriaSubcategoria("Kits").success).toBe(false);
    expect(parseCategoriaSubcategoria("").success).toBe(false);
  });

  it("traduz os códigos do banco sem repetir a mensagem crua", () => {
    const cru = 'duplicate key value violates unique constraint "subcategorias_categoria_nome_key"';
    for (const code of ["23505", "23514", "23503", "42501", "XX000", undefined]) {
      const m = traduzirErroSubcategoria({ code, message: cru });
      expect(m).not.toContain("subcategorias_");
      expect(m).not.toContain("constraint");
      expect(m.length).toBeGreaterThan(10);
    }
    expect(traduzirErroSubcategoria({ code: "23505" })).toMatch(/Já existe uma subcategoria com esse nome/);
    expect(traduzirErroSubcategoria({ code: "23514" })).toMatch(/1 a 80 caracteres/);
  });

  it("a mensagem de uso conta no singular e no plural", () => {
    expect(mensagemEmUso(1)).toBe("1 produto usa esta subcategoria; desative em vez de apagar.");
    expect(mensagemEmUso(3)).toBe("3 produtos usam esta subcategoria; desative em vez de apagar.");
  });
});
