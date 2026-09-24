import { createClient } from "@/lib/supabase/server";
import { createProduto } from "../actions";
import { ProdutoForm } from "../produto-form";

export default async function NovoProdutoPage() {
  const supabase = await createClient();
  const { data: produtos } = await supabase
    .from("produtos")
    .select("nome, ativo")
    .order("nome", { ascending: true });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h1 className="admin-page-h1" style={{ fontFamily: "var(--font-heading)", fontSize: 32, lineHeight: 1.3, margin: 0, color: "var(--pdm-brown)" }}>
          Cadastrar produto
        </h1>
        <p style={{ margin: "4px 0 0", color: "var(--pdm-muted)" }}>
          Quanto mais completo o cadastro, mais fácil o cliente decidir.
        </p>
      </div>
      {/* Id novo gerado aqui no servidor: as fotos extras sobem para
          galeria/{id}/ antes de o produto existir (ver actions.ts). */}
      <ProdutoForm
        action={createProduto}
        produtoId={crypto.randomUUID()}
        submitLabel="Cadastrar produto"
        produtosDisponiveis={produtos ?? []}
      />
    </div>
  );
}
