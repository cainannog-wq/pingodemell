import { diaDaSemana, hojeBrasilia, lerDataIso } from "@/lib/tempo/brasilia";

export type ParseDataResult =
  | { success: true; data: string }
  | { success: false; error: string };

const SEGUNDA_FEIRA = 1; // diaDaSemana(): 0 = domingo, 1 = segunda, ...

function parseIsoDate(raw: string): string | null {
  return lerDataIso(raw) ? raw.trim() : null;
}

// Função pura (sem I/O), testável sem precisar de credencial do Supabase.
// `hoje` é injetável só para o teste conseguir simular "ontem"/"amanhã" sem
// depender do relógio real da máquina.
//
// "Hoje" é sempre o dia do calendário de Brasília (src/lib/tempo/brasilia.ts),
// não o do relógio do servidor: a Server Action roda em UTC na Netlify, e
// entre 21h e meia-noite de Brasília o dia em UTC já é o seguinte.
//
// Segunda-feira é fechada por padrão (ver parseReaberturaData) e não deve
// virar uma entrada aqui — evita ter a mesma regra representada em dois
// lugares ao mesmo tempo.
export function parseDiaOffData(raw: string, hoje: Date = new Date()): ParseDataResult {
  const iso = parseIsoDate(raw);
  if (!iso) return { success: false, error: "Selecione uma data válida." };

  if (iso < hojeBrasilia(hoje)) {
    return { success: false, error: "Não é possível marcar um dia off no passado." };
  }
  if (diaDaSemana(iso) === SEGUNDA_FEIRA) {
    return {
      success: false,
      error: "Segunda-feira já é fechada por padrão — use a reabertura de segunda em vez de marcar aqui.",
    };
  }

  return { success: true, data: iso };
}

// Reabertura pontual de uma segunda-feira específica (a exceção que volta a
// abrir produção num dia que, por padrão, está fechado).
export function parseReaberturaData(raw: string, hoje: Date = new Date()): ParseDataResult {
  const iso = parseIsoDate(raw);
  if (!iso) return { success: false, error: "Selecione uma data válida." };

  if (iso < hojeBrasilia(hoje)) {
    return { success: false, error: "Não é possível reabrir uma segunda-feira no passado." };
  }
  if (diaDaSemana(iso) !== SEGUNDA_FEIRA) {
    return { success: false, error: "Só é possível reabrir uma segunda-feira." };
  }

  return { success: true, data: iso };
}
