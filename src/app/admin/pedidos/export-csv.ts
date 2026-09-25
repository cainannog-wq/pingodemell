import type { Pedido } from "@/lib/pedidos/types";
import { STATUS_LABEL } from "@/lib/pedidos/status";
import { formatDataHoraCurta } from "@/lib/pedidos/format";
import { hojeBrasilia } from "@/lib/tempo/brasilia";

// ";" como separador (não ",") porque o Excel em português do Brasil usa
// vírgula como separador decimal — com "," como delimitador de coluna, o
// Excel abre tudo numa coluna só. BOM UTF-8 no início pra acentuação
// aparecer certa ao abrir o arquivo direto no Excel.
const SEPARADOR = ";";
const BOM = "﻿";

// Campos como cliente_nome e ocasiao vem de um formulario publico, sem
// autenticacao (o insert de pedido é anônimo por design). Se um valor
// comecar com =, +, -, @, tab ou CR, o Excel/Sheets pode interpretar a
// celula como formula ao abrir o CSV (CSV/formula injection) — um
// "cliente" poderia gravar algo como "=HYPERLINK(...)" no nome e tentar
// vazar dado ou rodar comando quando o admin abre a planilha exportada.
// Prefixar com um apóstrofo neutraliza isso sem mudar o texto visível.
const PREFIXOS_FORMULA = ["=", "+", "-", "@", "\t", "\r"];

function celula(valor: string | number): string {
  let texto = String(valor);
  if (PREFIXOS_FORMULA.some((p) => texto.startsWith(p))) {
    texto = `'${texto}`;
  }
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

  // Data do calendário de Brasília, não do fuso do aparelho.
  const nomeArquivo = `pedidos-${hojeBrasilia()}.csv`;

  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
