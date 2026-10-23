import { describe, expect, it } from "vitest";
import { textoQuantidadeItem } from "@/lib/pedidos/format";
import { quantidadeDaLinha } from "@/lib/pedidos/mensagem";
import type { ItemEnvio } from "@/lib/pedidos/envio";
import { formatarPrecoVitrine } from "./mais-pedidos";
import { nomeDaUnidade, textoMinimo, textoMinimoCurto, textoMinimoDaQuantidade, textoQuantidadeNaUnidade } from "./minimo";
import { unidadeDeVenda } from "./unidade";

// Exibição da unidade de venda (PR unidade/texto-venda, 11/10/2026), com os
// valores como estão guardados em produtos.unidade_venda: "unidade" e
// "caixa" sem artigo; "o kit", "o cento", "o kg", "o combo" com artigo.

type Tipo = "normal" | "cento" | "bolo" | "bento_cake";
const preco = (valor: number, unidade_venda: string | null, tipo: Tipo = "normal") =>
  formatarPrecoVitrine({ preco: valor, tipo, unidade_venda, preco_a_partir_de: tipo === "bolo" ? valor : undefined });
const produto = (pedido_minimo: number, unidade_venda: string | null, tipo: Tipo = "normal") => ({ pedido_minimo, unidade_venda, tipo });

const CASOS: { guardado: string; preco: string; um: string; varios: string }[] = [
  { guardado: "unidade", preco: "R$ 2,50 a unidade", um: "1 unidade", varios: "30 unidades" },
  { guardado: "caixa", preco: "R$ 2,50 a caixa", um: "1 caixa", varios: "30 caixas" },
  { guardado: "o kit", preco: "R$ 2,50 o kit", um: "1 kit", varios: "30 kits" },
  { guardado: "o cento", preco: "R$ 2,50 o cento", um: "1 cento", varios: "30 centos" },
  { guardado: "o kg", preco: "R$ 2,50 o kg", um: "1 kg", varios: "30 kg" },
  { guardado: "o combo", preco: "R$ 2,50 o combo", um: "1 combo", varios: "30 combos" },
];

describe("unidade de venda: preço sem 'por', quantidade e mínimo no plural", () => {
  it.each(CASOS)("$guardado", ({ guardado, preco: esperado, um, varios }) => {
    expect(preco(2.5, guardado)).toBe(esperado);
    expect(preco(2.5, guardado)).not.toContain("por");
    expect(textoQuantidadeNaUnidade(1, guardado)).toBe(um);
    expect(textoQuantidadeNaUnidade(30, guardado)).toBe(varios);
    expect(textoMinimoCurto(produto(30, guardado))).toBe(`mín. ${varios}`);
    expect(textoMinimo(produto(30, guardado))).toBe(`Pedido mínimo: ${varios}`);
    // O artigo do valor guardado não entra no mínimo nem na quantidade.
    expect(textoMinimoCurto(produto(30, guardado))).not.toMatch(/ (o|a) /);
  });

  it("com ou sem artigo, maiúscula ou espaço sobrando, é a mesma unidade", () => {
    expect(preco(10, "kit")).toBe("R$ 10,00 o kit");
    expect(preco(10, "O Kit")).toBe("R$ 10,00 o kit");
    expect(preco(10, "a caixa")).toBe("R$ 10,00 a caixa");
    expect(preco(10, "kg")).toBe("R$ 10,00 o kg");
    expect(preco(10, "cento")).toBe("R$ 10,00 o cento");
    expect(unidadeDeVenda("  o   combo ")?.chave).toBe("combo");
  });

  it("Kit Escolar Individual: preço, mínimo do card, mínimo da interna", () => {
    expect(preco(26, "o kit")).toBe("R$ 26,00 o kit");
    expect(textoMinimoCurto(produto(10, "o kit"))).toBe("mín. 10 kits");
    expect(textoMinimo(produto(10, "o kit"))).toBe("Pedido mínimo: 10 kits");
  });

  it("fora da lista: só o preço e só o número, nunca o texto quebrado", () => {
    expect(preco(40, "caixa com 6")).toBe("R$ 40,00");
    expect(nomeDaUnidade(3, "caixa com 6")).toBeNull();
    expect(textoQuantidadeNaUnidade(3, "caixa com 6")).toBe("3");
    expect(textoMinimoCurto(produto(3, "caixa com 6"))).toBe("mín. 3");
    expect(textoMinimoDaQuantidade(3, "bandeja")).toBe("mín. 3");
  });

  it("unidade vazia: só o preço e só o número, como antes", () => {
    expect(preco(40, null)).toBe("R$ 40,00");
    expect(preco(40, "  ")).toBe("R$ 40,00");
    expect(textoMinimoCurto(produto(3, null))).toBe("mín. 3");
  });

  it("mínimo 1 não aparece", () => {
    expect(textoMinimoCurto(produto(1, "o kit"))).toBeNull();
    expect(textoMinimo(produto(1, "o kit"))).toBeNull();
  });

  it("Bento Cake: 'o combo' só no combo; o simples continua sem unidade", () => {
    expect(preco(95, "o combo", "bento_cake")).toBe("R$ 95,00 o combo");
    expect(preco(42, "unidade", "bento_cake")).toBe("R$ 42,00");
    expect(preco(47, null, "bento_cake")).toBe("R$ 47,00");
  });

  it("Cento (tipo Cento) e Bolo não mudam", () => {
    expect(preco(48, "o cento", "cento")).toBe("R$ 48,00 o cento");
    expect(preco(48, null, "cento")).toBe("R$ 48,00 o cento");
    expect(preco(108, "o kg", "bolo")).toBe("A partir de R$ 108,00 o kg");
  });
});

describe("unidade de venda: mensagem do WhatsApp e painel", () => {
  const item = (quantidade: number, unidade_venda: string | null): ItemEnvio =>
    ({ tipo: "normal", produto_id: "x", nome: "Kit", quantidade, preco: 1, observacao: null, unidade_venda }) as ItemEnvio;

  it.each([
    ["o kit", "10 kits"],
    ["caixa", "2 caixas"],
    ["o cento", "2 centos"],
    ["o kg", "2 kg"],
    ["o combo", "2 combos"],
    ["unidade", "50 unidades"],
  ])("%s", (unidade, esperado) => {
    const quantidade = Number(esperado.split(" ")[0]);
    expect(quantidadeDaLinha(item(quantidade, unidade))).toBe(esperado);
    expect(textoQuantidadeItem({ quantidade, tipo: "normal", unidade_venda: unidade })).toBe(esperado);
  });

  it("singular com 1, sem unidade conta como unidade, fora da lista só o número", () => {
    expect(quantidadeDaLinha(item(1, "o kit"))).toBe("1 kit");
    expect(quantidadeDaLinha(item(1, null))).toBe("1 unidade");
    expect(quantidadeDaLinha(item(3, "caixa com 6"))).toBe("3");
    expect(textoQuantidadeItem({ quantidade: 3, tipo: "normal", unidade_venda: null })).toBe("3 unidades");
    expect(textoQuantidadeItem({ quantidade: 3, tipo: "normal", unidade_venda: "caixa com 6" })).toBe("3");
  });

  it("painel: Bento Cake e pedido antigo sem tipo em unidades; Bolo e Cento como antes", () => {
    expect(textoQuantidadeItem({ quantidade: 2, tipo: "bento" })).toBe("2 unidades");
    expect(textoQuantidadeItem({ quantidade: 1 })).toBe("1 unidade");
    expect(textoQuantidadeItem({ quantidade: 2, tipo: "bolo" })).toBe("2 kg");
    expect(textoQuantidadeItem({ quantidade: 1, tipo: "cento" })).toBe("1 cento");
  });
});
