// Formatação manual (sem toLocaleString/Intl com timezone implícito) para
// evitar divergência de hidratação entre o servidor (roda em UTC na
// Netlify) e o navegador (roda no horário de Brasília) — mesmo cuidado já
// adotado em admin/produtos/produtos-list.tsx para valores em reais.
//
// Datas do pedido (criado_em, data_hora_entrega, status_atualizado_em) são
// timestamptz reais (instante em UTC). Brasília não observa mais horário
// de verão desde 2019, então o deslocamento fixo de -3h abaixo é exato.

const BRASILIA_OFFSET_MS = 3 * 60 * 60 * 1000;

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function paraBrasilia(iso: string): Date {
  return new Date(new Date(iso).getTime() - BRASILIA_OFFSET_MS);
}

export function formatMoeda(valor: number): string {
  const negativo = valor < 0;
  const [intPart, decPart] = Math.abs(valor).toFixed(2).split(".");
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negativo ? "-" : ""}R$ ${withThousands},${decPart}`;
}

export function formatDataCurta(iso: string): string {
  const d = paraBrasilia(iso);
  return `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}`;
}

export function formatHora(iso: string): string {
  const d = paraBrasilia(iso);
  const min = d.getUTCMinutes();
  return `${pad2(d.getUTCHours())}h${min > 0 ? pad2(min) : ""}`;
}

export function formatDataHoraCurta(iso: string): string {
  return `${formatDataCurta(iso)} · ${formatHora(iso)}`;
}

export function formatDataHoraExtensa(iso: string): string {
  const d = paraBrasilia(iso);
  return `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}, às ${formatHora(iso)}`;
}

// "2026-09" — usado para agrupar/filtrar pedidos por mês corrente (cards
// de estatística), sempre em referência ao calendário de Brasília.
export function brasiliaAnoMes(iso: string): string {
  const d = paraBrasilia(iso);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

function brasiliaDiaChave(iso: string): string {
  const d = paraBrasilia(iso);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

// Diferença em dias de calendário (Brasília) entre a data do pedido e hoje
// — 0 é hoje, 1 é amanhã, -1 é ontem. Usado pra agrupar o histórico de
// pedidos do painel (reorganização mobile de 22/09/2026): "Atrasados" (dias
// < 0 e ainda em aberto), cabeçalho de grupo por dia, e o corte de 7 dias
// dos pedidos finalizados. Comparação por chave de calendário (não por
// milissegundos) pra não depender do horário do dia, só da data.
export function brasiliaDiferencaDias(iso: string): number {
  const [ay, am, ad] = brasiliaDiaChave(iso).split("-").map(Number);
  const [hy, hm, hd] = brasiliaDiaChave(new Date().toISOString()).split("-").map(Number);
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(hy, hm - 1, hd)) / 86_400_000);
}

const DIAS_SEMANA_CURTO = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// Rótulo do cabeçalho de grupo de dia no histórico de pedidos: "Hoje",
// "Amanhã" ou "Sáb, 27/09" pra qualquer outro dia.
export function formatDiaGrupo(iso: string): string {
  const dias = brasiliaDiferencaDias(iso);
  if (dias === 0) return "Hoje";
  if (dias === 1) return "Amanhã";
  const d = paraBrasilia(iso);
  return `${DIAS_SEMANA_CURTO[d.getUTCDay()]}, ${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}`;
}

// Gera o link wa.me a partir do WhatsApp salvo no pedido (qualquer
// formatação livre digitada, ex.: "(41) 99612-4477"). Assume DDD
// brasileiro quando não há código de país (55) já incluso.
export function buildWhatsAppLink(whatsapp: string): string {
  const digitos = whatsapp.replace(/\D/g, "");
  const comPais = digitos.startsWith("55") ? digitos : `55${digitos}`;
  return `https://wa.me/${comPais}`;
}
