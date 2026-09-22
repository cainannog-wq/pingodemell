import { createClient } from "@/lib/supabase/server";
import type { DiaOff } from "@/lib/dias-off/types";
import { Calendario } from "./calendario";

export default async function DiasOffPage() {
  const supabase = await createClient();
  const { data: diasOff, error } = await supabase
    .from("dias_off")
    .select("*")
    .order("data", { ascending: true });

  if (error) {
    return (
      <p style={{ color: "var(--pdm-error)" }}>
        Não foi possível carregar os dias sem produção: {error.message}
      </p>
    );
  }

  return <Calendario diasOff={(diasOff ?? []) as DiaOff[]} />;
}
