import { describe, expect, it } from "vitest";
import { linhaValida, type LinhaCarrinho } from "@/lib/carrinho/regras";
import { textoQuantidadeItem } from "@/lib/pedidos/format";
import { itemDaLinha, montarCorpo } from "@/lib/pedidos/envio";
import { CHAVE_TESTE, DADOS_TESTE, LINHAS_TESTE } from "@/lib/pedidos/fixtura-teste";
import { montarRetrato } from "@/lib/pedidos/confirmacao";
import { quantidadeDaLinha } from "@/lib/pedidos/mensagem";
import { validarPedido } from "@/lib/pedidos/validacao";
import { textoQuantidadeDaLinha } from "@/components/site/LinhaDoPedido";
import { bentoCombo, unidadeDoBento } from "./unidade";

// Bento Cake combo (PR admin/bento-preserva-e-textos-combo): o preço é por
// combo, e a quantidade conta combos no carrinho, no checkout, na mensagem
// do WhatsApp, na confirmação e no painel. O Bento simples e a linha de
// antes do campo continuam em unidades.

const COMBO: LinhaCarrinho = {
  id: "combo",
  tipo: "bento",
  produtoId: "0f5fca3a-e0fb-4181-90e6-54cd4598fd6e",
  slug: "bento-cake-com-6-doces",
  nome: "Bento Cake com 6 doces",
  preco: 75,
  quantidade: 2,
  recheio: { id: "5b1f8a7e-0d3c-4b4e-9a51-0c2b8e6f7a10", nome: "Ninho" },
  pedidoMinimo: 1,
  unidade_venda: "o combo",
  observacao: null,
};
const SIMPLES: LinhaCarrinho = { ...COMBO, id: "simples", nome: "Bento Cake Flork", preco: 47, unidade_venda: "unidade" } as LinhaCarrinho;
const ANTIGA = { ...COMBO, id: "antiga" } as Record<string, unknown>;
delete ANTIGA.unidade_venda;

describe("Bento Cake: combo ou unidade", () => {
  it("só \"o combo\" (com ou sem artigo) conta como combo", () => {
    expect(bentoCombo("o combo")).toBe(true);
    expect(bentoCombo("Combo")).toBe(true);
    expect(bentoCombo("unidade")).toBe(false);
    expect(bentoCombo(null)).toBe(false);
    expect(bentoCombo(undefined)).toBe(false);
    expect(unidadeDoBento("o kit").chave).toBe("unidade");
  });

  it("carrinho e checkout: \"2 combos\", \"1 combo\"; simples e linha antiga em unidades", () => {
    expect(textoQuantidadeDaLinha(COMBO)).toBe("2 combos");
    expect(textoQuantidadeDaLinha({ ...COMBO, quantidade: 1 } as LinhaCarrinho)).toBe("1 combo");
    expect(textoQuantidadeDaLinha(SIMPLES)).toBe("2 unidades");
    expect(textoQuantidadeDaLinha(ANTIGA as LinhaCarrinho)).toBe("2 unidades");
  });

  it("a linha do carrinho aceita a unidade gravada, a ausente e o nulo; recusa texto grande demais", () => {
    expect(linhaValida(COMBO)).toBe(true);
    expect(linhaValida(ANTIGA)).toBe(true);
    expect(linhaValida({ ...COMBO, unidade_venda: null })).toBe(true);
    expect(linhaValida({ ...COMBO, unidade_venda: "x".repeat(21) })).toBe(false);
  });

  it("o envio leva a unidade do Bento; linha antiga vai com nulo", () => {
    expect(itemDaLinha(COMBO)).toMatchObject({ tipo: "bento", unidade_venda: "o combo" });
    expect(itemDaLinha(ANTIGA as LinhaCarrinho)).toMatchObject({ tipo: "bento", unidade_venda: null });
  });

  it("o servidor aceita e grava a unidade do Bento, aceita pedido sem o campo e não muda o valor", () => {
    const hoje = "2026-09-29";
    const corpo = montarCorpo(DADOS_TESTE, [COMBO], CHAVE_TESTE);
    const r = validarPedido(corpo, hoje);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.pedido.itens[0]).toMatchObject({ tipo: "bento", unidade_venda: "o combo", quantidade: 2, preco_unitario: 75 });
    expect(r.valor.valoresCentavos).toEqual([15000]);

    const semCampo = {
      ...corpo,
      itens: corpo.itens.map((i) => {
        const resto: Record<string, unknown> = { ...i };
        delete resto.unidade_venda;
        return resto;
      }),
    };
    const r2 = validarPedido(semCampo, hoje);
    expect(r2.ok && r2.valor.pedido.itens[0].unidade_venda).toBe(null);
  });

  it("mensagem do WhatsApp e confirmação: \"2 combos\", sem \"unidades\"", () => {
    const linhas = [COMBO, SIMPLES];
    const itens = linhas.map((l) => ({ valor_centavos: Math.round(l.preco * 100) * l.quantidade }));
    const total = itens.reduce((a, b) => a + b.valor_centavos, 0);
    const r = montarRetrato({
      dados: DADOS_TESTE,
      linhas,
      resposta: { numero: 1048, itens, subtotal_centavos: total, total_centavos: total },
      prazo: null,
    });
    expect(r.mensagem).toContain("1. Bento Cake com 6 doces, recheio Ninho, 2 combos, R$ 150,00");
    expect(r.mensagem).toContain("2. Bento Cake Flork, recheio Ninho, 2 unidades, R$ 94,00");
    expect(r.linhas[0].quantidade).toBe("2 combos");
    expect(quantidadeDaLinha(itemDaLinha(COMBO))).toBe("2 combos");
  });

  it("painel: Bento combo em combos; simples e pedido de antes do campo em unidades", () => {
    expect(textoQuantidadeItem({ quantidade: 2, tipo: "bento", unidade_venda: "o combo" })).toBe("2 combos");
    expect(textoQuantidadeItem({ quantidade: 1, tipo: "bento", unidade_venda: "o combo" })).toBe("1 combo");
    expect(textoQuantidadeItem({ quantidade: 2, tipo: "bento", unidade_venda: "unidade" })).toBe("2 unidades");
    expect(textoQuantidadeItem({ quantidade: 2, tipo: "bento" })).toBe("2 unidades");
  });

  it("os outros tipos não mudam", () => {
    const kit = { ...LINHAS_TESTE.find((l) => l.tipo === "normal")!, unidade_venda: "o kit", quantidade: 10 } as LinhaCarrinho;
    expect(textoQuantidadeDaLinha(kit)).toBe("10 kits");
    expect(textoQuantidadeItem({ quantidade: 10, tipo: "normal", unidade_venda: "o kit" })).toBe("10 kits");
    expect(textoQuantidadeItem({ quantidade: 2, tipo: "cento" })).toBe("2 centos");
    expect(textoQuantidadeItem({ quantidade: 3, tipo: "bolo" })).toBe("3 kg");
  });
});
