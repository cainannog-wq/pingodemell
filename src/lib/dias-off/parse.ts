export type ParseDiaOffResult =
  | { success: true; data: string }
  | { success: false; error: string };

function toIsoLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Função pura (sem I/O), testável sem precisar de credencial do Supabase.
// `hoje` é injetável só para o teste conseguir simular "ontem"/"amanhã" sem
// depender do relógio real da máquina.
export function parseDiaOffData(raw: string, hoje: Date = new Date()): ParseDiaOffResult {
  const trimmed = raw.trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return { success: false, error: "Selecione uma data válida." };
  }

  const [y, m, d] = trimmed.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    return { success: false, error: "Selecione uma data válida." };
  }

  if (trimmed < toIsoLocal(hoje)) {
    return { success: false, error: "Não é possível marcar um dia off no passado." };
  }

  return { success: true, data: trimmed };
}
