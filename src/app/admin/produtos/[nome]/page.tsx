import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Produto } from "@/lib/produtos/types";
import { updateProduto } from "../actions";
import { ProdutoForm } from "../produto-form";
import { Icon, Button } from "@/components/ds";

export default async function EditarProdutoPage({
  params,
}: {
  params: Promise<{ nome: string }>;
}) {
  const { nome } = await params;
  const nomeDecodificado = decodeURIComponent(nome);

  const supabase = await createClient();
  const { data: produto } = await supabase
    .from("produtos")
    .select("*")
    .eq("nome", nomeDecodificado)
    .maybeSingle<Produto>();

  if (!produto) {
    return (
      <div style={{ padding: "80px 24px", display: "grid", placeItems: "center", textAlign: "center", background: "var(--pdm-cream-warm)", borderRadius: "var(--radius)" }}>
        <div style={{ maxWidth: "46ch", display: "grid", justifyItems: "center", gap: 16 }}>
          <Icon name="search_off" size={40} tone="accent" />
          <h3 style={{ fontFamily: "var(--font-heading)", fontSize: 24, lineHeight: 1.4, margin: 0, color: "var(--pdm-brown)" }}>
            Produto &quot;{nomeDecodificado}&quot; não encontrado
          </h3>
          <p style={{ margin: 0, color: "var(--pdm-muted)" }}>Ele pode já ter sido excluído ou renomeado.</p>
          <Link href="/admin/produtos">
            <Button variant="secondary">Voltar para produtos</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 32, lineHeight: 1.3, margin: 0, color: "var(--pdm-brown)" }}>
          Editar produto
        </h1>
        <p style={{ margin: "4px 0 0", color: "var(--pdm-muted)" }}>{produto.nome}</p>
      </div>
      <ProdutoForm action={updateProduto.bind(null, produto.nome)} produto={produto} submitLabel="Salvar alterações" />
    </div>
  );
}
