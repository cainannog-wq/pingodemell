import { createProduto } from "../actions";
import { ProdutoForm } from "../produto-form";

export default function NovoProdutoPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 32, lineHeight: 1.3, margin: 0, color: "var(--pdm-brown)" }}>
          Cadastrar produto
        </h1>
        <p style={{ margin: "4px 0 0", color: "var(--pdm-muted)" }}>
          Quanto mais completo o cadastro, mais fácil o cliente decidir.
        </p>
      </div>
      <ProdutoForm action={createProduto} submitLabel="Cadastrar produto" />
    </div>
  );
}
