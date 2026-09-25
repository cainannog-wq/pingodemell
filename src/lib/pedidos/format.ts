// Datas e horas dos pedidos no relógio de Brasília. Quem decide "que dia
// é" é o módulo src/lib/tempo/brasilia.ts (fuso America/Sao_Paulo explícito,
// via Intl): dá o mesmo resultado no servidor (UTC na Netlify) e no
// navegador, então não há divergência de hidratação. Até o PR fuso-brasilia
// isto usava um deslocamento fixo de -3h; format.equivalencia.test.ts prova
// que o resultado é o mesmo em todas as horas de 2026.
//
// Formatação manual (sem toLocaleString) pelo mesmo motivo de
// admin/produtos/produtos-list.tsx: texto idêntico nos dois lados.

import { anoMesBrasilia, diferencaEmDias, hojeBrasilia, partesBrasilia } from "@/lib/tempo/brasilia";

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatMoeda(valor: number): string {
  const negativo = valor < 0;
  const [intPart, decPart] = Math.abs(valor).toFixed(2).split(".");
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negativo ? "-" : ""}R$ ${withThousands},${decPart}`;
}

export function formatDataCurta(iso: string): string {
  const { dia, mes } = partesBrasilia(iso);
  return `${pad2(dia)}/${pad2(mes)}`;
}

export function formatHora(iso: string): string {
  const { hora, minuto } = partesBrasilia(iso);
  return `${pad2(hora)}h${minuto > 0 ? pad2(minuto) : ""}`;
}

export function formatDataHoraCurta(iso: string): string {
  return `${formatDataCurta(iso)} · ${formatHora(iso)}`;
}

export function formatDataHoraExtensa(iso: string): string {
  const { dia, mes, ano } = partesBrasilia(iso);
  return `${dia} de ${MESES[mes - 1]} de ${ano}, às ${formatHora(iso)}`;
}

// "2026-09" — usado para agrupar/filtrar pedidos por mês corrente (cards
// de estatística), sempre em referência ao calendário de Brasília.
export function brasiliaAnoMes(iso: string): string {
  return anoMesBrasilia(iso);
}

// Diferença em dias de calendário (Brasília) entre a data do pedido e hoje
// — 0 é hoje, 1 é amanhã, -1 é ontem. Usado pra agrupar o histórico de
// pedidos do painel (reorganização mobile de 22/09/2026): "Atrasados" (dias
// < 0 e ainda em aberto), cabeçalho de grupo por dia, e o corte de 7 dias
// dos pedidos finalizados. Comparação por data de calendário (não por
// milissegundos) pra não depender do horário do dia, só da data.
// `agora` vem de fora quando a tela já travou um instante (pedidos-list).
export function brasiliaDiferencaDias(iso: string, agora: Date | number = new Date()): number {
  return diferencaEmDias(hojeBrasilia(agora), hojeBrasilia(iso));
}

const DIAS_SEMANA_CURTO = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// Rótulo do cabeçalho de grupo de dia no histórico de pedidos: "Hoje",
// "Amanhã" ou "Sáb, 27/09" pra qualquer outro dia.
export function formatDiaGrupo(iso: string, agora: Date | number = new Date()): string {
  const dias = brasiliaDiferencaDias(iso, agora);
  if (dias === 0) return "Hoje";
  if (dias === 1) return "Amanhã";
  const { diaDaSemana, dia, mes } = partesBrasilia(iso);
  return `${DIAS_SEMANA_CURTO[diaDaSemana]}, ${pad2(dia)}/${pad2(mes)}`;
}

// Gera o link wa.me a partir do WhatsApp salvo no pedido (qualquer
// formatação livre digitada, ex.: "(41) 99612-4477"). Assume DDD
// brasileiro quando não há código de país (55) já incluso.
export function buildWhatsAppLink(whatsapp: string): string {
  const digitos = whatsapp.replace(/\D/g, "");
  const comPais = digitos.startsWith("55") ? digitos : `55${digitos}`;
  return `https://wa.me/${comPais}`;
}
