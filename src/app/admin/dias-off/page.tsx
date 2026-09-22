import { createClient } from "@/lib/supabase/server";
import type { DiaOff, SegundaReabertura } from "@/lib/dias-off/types";
import { Calendario } from "./calendario";

export default async function DiasOffPage() {
  const supabase = await createClient();
  const [diasOffRes, reaberturasRes] = await Promise.all([
    supabase.from("dias_off").select("*").order("data", { ascending: true }),
    supabase.from("segunda_reaberturas").select("*").order("data", { ascending: true }),
  ]);

  if (diasOffRes.error) {
    return (
      <p style={{ color: "var(--pdm-error)" }}>
        Não foi possível carregar os dias sem produção: {diasOffRes.error.message}
      </p>
    );
  }
  if (reaberturasRes.error) {
    return (
      <p style={{ color: "var(--pdm-error)" }}>
        Não foi possível carregar as reaberturas de segunda-feira: {reaberturasRes.error.message}
      </p>
    );
  }

  return (
    <Calendario
      diasOff={(diasOffRes.data ?? []) as DiaOff[]}
      reaberturas={(reaberturasRes.data ?? []) as SegundaReabertura[]}
    />
  );
}
