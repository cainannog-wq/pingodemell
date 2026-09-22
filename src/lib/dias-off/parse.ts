export type ParseDataResult =
  | { success: true; data: string }
  | { success: false; error: string };

const SEGUNDA_FEIRA = 1; // Date#getDay(): 0 = domingo, 1 = segunda, ...

function toIsoLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseIsoDate(raw: string): { date: Date; iso: string } | null {
  const trimmed = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;

  const [y, m, d] = trimmed.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    return null;
  }
  return { date, iso: trimmed };
}

// Função pura (sem I/O), testável sem precisar de credencial do Supabase.
// `hoje` é injetável só para o teste conseguir simular "ontem"/"amanhã" sem
// depender do relógio real da máquina.
//
// Segunda-feira é fechada por padrão (ver parseReaberturaData) e não deve
// virar uma entrada aqui — evita ter a mesma regra representada em dois
// lugares ao mesmo tempo.
export function parseDiaOffData(raw: string, hoje: Date = new Date()): ParseDataResult {
  const parsed = parseIsoDate(raw);
  if (!parsed) return { success: false, error: "Selecione uma data válida." };

  if (parsed.iso < toIsoLocal(hoje)) {
    return { success: false, error: "Não é possível marcar um dia off no passado." };
  }
  if (parsed.date.getDay() === SEGUNDA_FEIRA) {
    return {
      success: false,
      error: "Segunda-feira já é fechada por padrão — use a reabertura de segunda em vez de marcar aqui.",
    };
  }

  return { success: true, data: parsed.iso };
}

// Reabertura pontual de uma segunda-feira específica (a exceção que volta a
// abrir produção num dia que, por padrão, está fechado).
export function parseReaberturaData(raw: string, hoje: Date = new Date()): ParseDataResult {
  const parsed = parseIsoDate(raw);
  if (!parsed) return { success: false, error: "Selecione uma data válida." };

  if (parsed.iso < toIsoLocal(hoje)) {
    return { success: false, error: "Não é possível reabrir uma segunda-feira no passado." };
  }
  if (parsed.date.getDay() !== SEGUNDA_FEIRA) {
    return { success: false, error: "Só é possível reabrir uma segunda-feira." };
  }

  return { success: true, data: parsed.iso };
}
