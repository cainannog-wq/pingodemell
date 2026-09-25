// Único lugar do projeto que decide "que dia é" e "que dia da semana é"
// (regra do CLAUDE.md, PR fuso-brasilia).
//
// Tudo no fuso da loja, America/Sao_Paulo, de forma explícita via Intl:
// dá o mesmo resultado no servidor (Netlify e Supabase rodam em UTC) e no
// navegador (qualquer fuso em que o aparelho esteja). Sem isso, entre 21h e
// meia-noite de Brasília o servidor já está no dia seguinte.
//
// Datas de calendário ("2026-09-27") são texto AAAA-MM-DD e não têm fuso:
// dia da semana e contas de dias usam só o calendário (Date.UTC), nunca o
// relógio local.

export const FUSO = "America/Sao_Paulo";

export type PartesBrasilia = {
  ano: number;
  mes: number; // 1 a 12
  dia: number;
  hora: number; // 0 a 23
  minuto: number;
  diaDaSemana: number; // 0 = domingo ... 6 = sábado
};

const formatador = new Intl.DateTimeFormat("en-US", {
  timeZone: FUSO,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  hourCycle: "h23",
});

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// Instante (Date, ISO com fuso ou milissegundos) -> ano/mês/dia/hora/minuto
// no relógio de Brasília.
export function partesBrasilia(instante: Date | string | number = new Date()): PartesBrasilia {
  const data = instante instanceof Date ? instante : new Date(instante);
  const partes: Record<string, number> = {};
  for (const p of formatador.formatToParts(data)) {
    if (p.type !== "literal") partes[p.type] = Number(p.value);
  }
  const { year: ano, month: mes, day: dia, hour: hora, minute: minuto } = partes;
  return { ano, mes, dia, hora, minuto, diaDaSemana: diaDaSemana(montarDataIso(ano, mes, dia)) };
}

// "Hoje" no calendário de Brasília: "AAAA-MM-DD".
export function hojeBrasilia(agora: Date | string | number = new Date()): string {
  const { ano, mes, dia } = partesBrasilia(agora);
  return montarDataIso(ano, mes, dia);
}

// Mês do calendário de Brasília em que o instante cai: "AAAA-MM".
export function anoMesBrasilia(instante: Date | string | number = new Date()): string {
  const { ano, mes } = partesBrasilia(instante);
  return `${ano}-${pad2(mes)}`;
}

export function montarDataIso(ano: number, mes: number, dia: number): string {
  return `${ano}-${pad2(mes)}-${pad2(dia)}`;
}

// "AAAA-MM-DD" -> partes, ou null se não for uma data que existe
// (ex.: 2026-02-30).
export function lerDataIso(texto: string): { ano: number; mes: number; dia: number } | null {
  const limpo = texto.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(limpo)) return null;
  const [ano, mes, dia] = limpo.split("-").map(Number);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  return { ano, mes, dia };
}

// Dia da semana de uma data de calendário (0 = domingo ... 6 = sábado).
// Não depende de fuso: é a mesma data em qualquer lugar do mundo.
export function diaDaSemana(dataIso: string): number {
  const [ano, mes, dia] = dataIso.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
}

export function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

// Mês vizinho: somarMeses(2026, 12, 1) -> { ano: 2027, mes: 1 }.
export function somarMeses(ano: number, mes: number, delta: number): { ano: number; mes: number } {
  const total = ano * 12 + (mes - 1) + delta;
  return { ano: Math.floor(total / 12), mes: (total % 12 + 12) % 12 + 1 };
}

// Diferença em dias de calendário entre duas datas AAAA-MM-DD (b - a).
export function diferencaEmDias(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}
