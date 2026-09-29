import { createRecheio } from "../actions";
import { RecheioForm } from "../recheio-form";

export default function NovoRecheioPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h1 className="admin-page-h1" style={{ fontFamily: "var(--font-heading)", fontSize: 32, lineHeight: 1.3, margin: 0, color: "var(--pdm-brown)" }}>
          Cadastrar recheio
        </h1>
        <p style={{ margin: "4px 0 0", color: "var(--pdm-muted)" }}>Um recheio só, com a marcação de onde ele vale.</p>
      </div>
      <RecheioForm action={createRecheio} rotuloEnviar="Cadastrar recheio" />
    </div>
  );
}
