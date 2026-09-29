import { describe, expect, it } from "vitest";
import type { Pedido } from "@/lib/pedidos/types";
import { resumirPedidos } from "@/lib/pedidos/resumo";
import { gerarCSVPedidos } from "./export-csv";

// Planilha do histórico (PR confirmacao-e-gravacao): entrega sem valor sai
// "a combinar" (nunca 0,00), retirada "sem custo", e texto que começa com
// =, +, - ou @ não vira fórmula.

function pedido(sobrescrever: Partial<Pedido>): Pedido {
  return {
    id: "id",
    numero: 1048,
    cliente_nome: "Cliente",
    cliente_whatsapp: "(41) 99999-0000",
    cliente_email: null,
    ocasiao: null,
    modo_entrega: "entrega",
    endereco: "Rua X, 1",
    data_hora_entrega: "2026-10-17T17:00:00.000Z",
    forma_pagamento: "Pix",
    observacoes: null,
    itens: [{ nome: "Bolo", variacao: null, quantidade: 1, preco_unitario: 50 }],
    subtotal: 50,
    valor_entrega: 0,
    total: 50,
    status: "aguardando_confirmacao",
    criado_em: "2026-09-29T15:00:00.000Z",
    status_atualizado_em: "2026-09-29T15:00:00.000Z",
    teste: false,
    ...sobrescrever,
  };
}

function colunas(csv: string, linha: number): string[] {
  return csv.replace(/^﻿/, "").split("\r\n")[linha].split(";");
}

describe("planilha de pedidos", () => {
  it("entrega com valor 0 sai 'a combinar'; retirada sai 'sem custo'; entrega com valor sai o valor", () => {
    const csv = gerarCSVPedidos([
      pedido({ numero: 1 }),
      pedido({ numero: 2, modo_entrega: "retirada", endereco: null }),
      pedido({ numero: 3, valor_entrega: 15, total: 65 }),
    ]);
    const cabecalho = colunas(csv, 0);
    const i = cabecalho.indexOf("Valor de entrega");
    expect(colunas(csv, 1)[i]).toBe("a combinar");
    expect(colunas(csv, 2)[i]).toBe("sem custo");
    expect(colunas(csv, 3)[i]).toBe("15,00");
    expect(csv).not.toMatch(/;0,00;/);
  });

  it("escapa =, +, - e @ no começo do texto e marca a coluna de teste", () => {
    const csv = gerarCSVPedidos([
      pedido({ cliente_nome: "=HYPERLINK(1)", ocasiao: "@soma", teste: true }),
      pedido({ cliente_nome: "+5541", ocasiao: "-1" }),
    ]);
    const cabecalho = colunas(csv, 0);
    const [l1, l2] = [colunas(csv, 1), colunas(csv, 2)];
    expect(l1[cabecalho.indexOf("Cliente")]).toBe("'=HYPERLINK(1)");
    expect(l1[cabecalho.indexOf("Ocasião")]).toBe("'@soma");
    expect(l2[cabecalho.indexOf("Cliente")]).toBe("'+5541");
    expect(l2[cabecalho.indexOf("Ocasião")]).toBe("'-1");
    expect(l1[cabecalho.indexOf("Pedido de teste")]).toBe("Sim");
    expect(l2[cabecalho.indexOf("Pedido de teste")]).toBe("Não");
  });
});

describe("cards de resumo", () => {
  it("somam o total dos itens do mês de Brasília, sem os cancelados", () => {
    const r = resumirPedidos(
      [
        pedido({ total: 50 }),
        pedido({ total: 30.5, status: "entregue" }),
        pedido({ total: 99, status: "cancelado" }),
        pedido({ total: 1000, criado_em: "2026-08-31T12:00:00.000Z" }),
      ],
      "2026-09"
    );
    expect(r).toEqual({ pedidosNoMes: 3, aguardandoConfirmacao: 2, entregues: 1, valorNoMes: 80.5 });
  });
});
