import { diaDaSemana, diasNoMes, montarDataIso } from "./brasilia";

// Grade de um mês do calendário, semana por semana (domingo a sábado),
// com null nas casas antes do dia 1 e depois do último dia. Usada pelo
// calendário de dias off do admin e pelo calendário do checkout. Só
// calendário (Date.UTC, via brasilia.ts), sem relógio nem fuso.

export type CasaDoMes = { dia: number; iso: string } | null;

// mes: 1 a 12.
export function gradeDoMes(ano: number, mes: number): CasaDoMes[][] {
  const primeiroDia = diaDaSemana(montarDataIso(ano, mes, 1));
  const total = diasNoMes(ano, mes);

  const casas: CasaDoMes[] = [];
  for (let i = 0; i < primeiroDia; i++) casas.push(null);
  for (let dia = 1; dia <= total; dia++) casas.push({ dia, iso: montarDataIso(ano, mes, dia) });
  while (casas.length % 7 !== 0) casas.push(null);

  const semanas: CasaDoMes[][] = [];
  for (let i = 0; i < casas.length; i += 7) semanas.push(casas.slice(i, i + 7));
  return semanas;
}
