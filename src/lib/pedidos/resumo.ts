import type { Pedido } from "./types";
import { anoMesBrasilia } from "@/lib/tempo/brasilia";

// Cards de resumo do histórico de pedidos. "Mês" é o mês de Brasília.
// "Valor no mês" soma o total gravado (total dos itens; a entrega fica
// "a combinar" e entra só quando a loja tiver o valor).
export type ResumoPedidos = { pedidosNoMes: number; aguardandoConfirmacao: number; entregues: number; valorNoMes: number };

export function resumirPedidos(pedidos: Pedido[], mesAtual: string = anoMesBrasilia()): ResumoPedidos {
  const doMes = pedidos.filter((p) => anoMesBrasilia(p.criado_em) === mesAtual);
  return {
    pedidosNoMes: doMes.length,
    aguardandoConfirmacao: pedidos.filter((p) => p.status === "aguardando_confirmacao").length,
    entregues: pedidos.filter((p) => p.status === "entregue").length,
    valorNoMes: doMes.filter((p) => p.status !== "cancelado").reduce((soma, p) => soma + p.total, 0),
  };
}
