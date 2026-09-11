import type { Pedido } from "@/lib/pedidos/types";
import { STATUS_LABEL } from "@/lib/pedidos/status";
import { formatDataHoraCurta } from "@/lib/pedidos/format";

// ";" como separador (não ",") porque o Excel em português do Brasil usa
// vírgula como separador decimal — com "," como delimitador de coluna, o
// Excel abre tudo numa coluna só. BOM UTF-8 no início pra acentuação
// aparecer certa ao abrir o arquivo direto no Excel.
const SEPARADOR = ";";
const BOM = "﻿";

function celula(valor: string | number): string {
  const texto = String(valor);
  if (texto.includes(SEPARADOR) || texto.includes('"') || texto.includes("\n")) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

// Mesmo critério da coluna "Itens" da tabela em tela: quantidade de itens
// distintos do pedido, não a soma das quantidades de cada um.
function contarItens(pedido: Pedido): number {
  return pedido.itens.length;
}

const CABECALHO = [
  "Pedido",
  "Cliente",
  "Ocasião",
  "WhatsApp",
  "Modo de entrega",
  "Data/hora de entrega",
  "Itens",
  "Subtotal",
  "Valor de entrega",
  "Total",
  "Status",
  "Criado em",
];

export function gerarCSVPedidos(pedidos: Pedido[]): string {
  const linhas = pedidos.map((p) =>
    [
      p.numero,
      p.cliente_nome,
      p.ocasiao ?? "",
      p.cliente_whatsapp,
      p.modo_entrega === "entrega" ? "Entrega" : "Retirada",
      formatDataHoraCurta(p.data_hora_entrega),
      contarItens(p),
      p.subtotal.toFixed(2).replace(".", ","),
      p.valor_entrega.toFixed(2).replace(".", ","),
      p.total.toFixed(2).replace(".", ","),
      STATUS_LABEL[p.status],
      formatDataHoraCurta(p.criado_em),
    ]
      .map(celula)
      .join(SEPARADOR)
  );

  return BOM + [CABECALHO.join(SEPARADOR), ...linhas].join("\r\n");
}

export function exportarPedidosCSV(pedidos: Pedido[]): void {
  const csv = gerarCSVPedidos(pedidos);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const hoje = new Date();
  const nomeArquivo = `pedidos-${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}.csv`;

  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
