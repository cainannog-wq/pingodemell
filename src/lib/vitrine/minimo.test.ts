import { describe, expect, it } from "vitest";
import { textoMinimo, textoMinimoCurto, textoQuantidadeNaUnidade } from "./minimo";

const p = (pedido_minimo: number, unidade_venda: string | null, tipo: "normal" | "cento" = "normal") => ({
  pedido_minimo,
  unidade_venda,
  tipo,
});

describe("pedido mínimo na interna e no card", () => {
  it("unidade preenchida: com a unidade no plural certo", () => {
    expect(textoMinimo(p(10, "unidade"))).toBe("Pedido mínimo: 10 unidades");
    expect(textoMinimo(p(2, "kg"))).toBe("Pedido mínimo: 2 kg");
    expect(textoMinimo(p(3, "litro"))).toBe("Pedido mínimo: 3 litros");
    expect(textoMinimo(p(3, "caixa com 6"))).toBe("Pedido mínimo: 3 caixa com 6");
    expect(textoMinimoCurto(p(10, "unidade"))).toBe("mín. 10 un");
    expect(textoMinimoCurto(p(2, "kg"))).toBe("mín. 2 kg");
  });

  it("unidade vazia (todos os produtos de hoje): só o número, sem 'null' nem 'None'", () => {
    expect(textoMinimo(p(10, null))).toBe("Pedido mínimo: 10");
    expect(textoMinimo(p(10, "  "))).toBe("Pedido mínimo: 10");
    expect(textoMinimoCurto(p(30, null))).toBe("mín. 30");
  });

  it("mínimo 1 não aparece, com ou sem unidade", () => {
    expect(textoMinimo(p(1, null))).toBeNull();
    expect(textoMinimo(p(1, "kg"))).toBeNull();
    expect(textoMinimoCurto(p(1, "kg"))).toBeNull();
  });

  it("Cento nunca mostra pedido_minimo (conta em centos)", () => {
    expect(textoMinimo(p(20, null, "cento"))).toBeNull();
    expect(textoMinimoCurto(p(20, "unidade", "cento"))).toBeNull();
  });

  it("quantidade no subtotal", () => {
    expect(textoQuantidadeNaUnidade(1, "unidade")).toBe("1 unidade");
    expect(textoQuantidadeNaUnidade(10, "Unidade")).toBe("10 unidades");
    expect(textoQuantidadeNaUnidade(1, "kg")).toBe("1 kg");
    expect(textoQuantidadeNaUnidade(10, null)).toBe("10");
  });
});
