import Link from "next/link";
import { Button, Icon } from "@/components/ds";
import { ehUuid } from "@/lib/galeria/regras";
import { CAMPOS_RECHEIO, type Recheio } from "@/lib/recheios/types";
import { createClient } from "@/lib/supabase/server";
import { updateRecheio } from "../actions";
import { RecheioForm } from "../recheio-form";

export default async function EditarRecheioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const { data } = ehUuid(id)
    ? await supabase.from("recheios").select(CAMPOS_RECHEIO).eq("id", id).maybeSingle()
    : { data: null };
  const recheio = data as unknown as Recheio | null;

  if (!recheio) {
    return (
      <div style={{ padding: "80px 24px", display: "grid", placeItems: "center", textAlign: "center", background: "var(--pdm-cream-warm)", borderRadius: "var(--radius)" }}>
        <div style={{ maxWidth: "46ch", display: "grid", justifyItems: "center", gap: 16 }}>
          <Icon name="search_off" size={40} tone="accent" />
          <h3 style={{ fontFamily: "var(--font-heading)", fontSize: 24, lineHeight: 1.4, margin: 0, color: "var(--pdm-brown)" }}>
            Recheio não encontrado
          </h3>
          <Link href="/admin/recheios">
            <Button variant="secondary">Voltar para recheios</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h1 className="admin-page-h1" style={{ fontFamily: "var(--font-heading)", fontSize: 32, lineHeight: 1.3, margin: 0, color: "var(--pdm-brown)" }}>
          Editar recheio
        </h1>
        <p style={{ margin: "4px 0 0", color: "var(--pdm-muted)" }}>{recheio.nome}</p>
      </div>
      <RecheioForm action={updateRecheio.bind(null, recheio.id)} recheio={recheio} rotuloEnviar="Salvar alterações" />
    </div>
  );
}
