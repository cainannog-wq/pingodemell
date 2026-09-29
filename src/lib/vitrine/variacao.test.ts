import { describe, expect, it } from "vitest";
import { TIPO_PRODUTO_VALUES } from "@/lib/produtos/types";
import { variacaoDoProduto } from "./variacao";

describe("variacaoDoProduto — só o tipo decide a tela", () => {
  it.each([
    ["normal", "avulso"],
    ["cento", "cento"],
    ["bolo", "bolo"],
    ["bento_cake", "bento"],
  ] as const)("%s → %s", (tipo, esperado) => {
    expect(variacaoDoProduto({ tipo })).toBe(esperado);
  });

  it("todo tipo do cadastro tem variação (nenhum cai no padrão por esquecimento)", () => {
    for (const tipo of TIPO_PRODUTO_VALUES) {
      expect(["avulso", "cento", "bolo", "bento"]).toContain(variacaoDoProduto({ tipo }));
    }
  });

  it("a categoria não entra: produto normal em Bolos (Smash Cake) é avulso", () => {
    expect(variacaoDoProduto({ tipo: "normal", Categoria: "Bolos" } as never)).toBe("avulso");
  });

  it("tipo desconhecido (dado novo de um banco mais novo) cai no avulso, sem quebrar", () => {
    expect(variacaoDoProduto({ tipo: "outro" } as never)).toBe("avulso");
  });
});
