import Link from "next/link";
import { Button, Icon } from "@/components/ds";
import { bentoDisponivel, boloDisponivel } from "@/lib/recheios/regras";
import { CAMPOS_RECHEIO, type Recheio } from "@/lib/recheios/types";
import { createClient } from "@/lib/supabase/server";
import { RecheiosLista } from "./recheios-lista";

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="status"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        background: "var(--pdm-cream-warm)",
        borderRadius: "var(--radius)",
        boxShadow: "var(--shadow-rest)",
        padding: "16px 24px",
        color: "var(--pdm-brown)",
      }}
    >
      <Icon name="warning" size={24} tone="inherit" />
      <span>{children}</span>
    </div>
  );
}

export default async function RecheiosPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("recheios").select(CAMPOS_RECHEIO).order("nome", { ascending: true });

  if (error) {
    return <p style={{ color: "var(--pdm-error)" }}>Não foi possível carregar os recheios: {error.message}</p>;
  }

  const recheios = (data ?? []) as unknown as Recheio[];
  // Sem nenhum recheio ativo de um lado, os produtos daquele tipo somem do
  // site (como o Cento sem sabor ativo).
  const semBolo = !boloDisponivel(recheios);
  const semBento = !bentoDisponivel(recheios);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div className="admin-page-header" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 className="admin-page-h1" style={{ fontFamily: "var(--font-heading)", fontSize: 32, lineHeight: 1.3, margin: 0, color: "var(--pdm-brown)" }}>
            Recheios
          </h1>
          <p style={{ margin: "4px 0 0", color: "var(--pdm-muted)" }}>
            Uma lista só, usada no Bolo grande (com preço por kg) e no Bento Cake (só informativo).
          </p>
        </div>
        <Link href="/admin/recheios/novo" className="admin-page-header-cta">
          <Button iconLeft="add">Cadastrar recheio</Button>
        </Link>
      </div>

      {semBolo ? <Aviso>Nenhum recheio ativo para o Bolo grande: os produtos do tipo Bolo não aparecem no site.</Aviso> : null}
      {semBento ? <Aviso>Nenhum recheio ativo para o Bento Cake: os produtos do tipo Bento Cake não aparecem no site.</Aviso> : null}

      <RecheiosLista recheios={recheios} />
    </div>
  );
}
