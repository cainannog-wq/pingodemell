import { createClient } from "@/lib/supabase/server";
import { CAMPOS_SUBCATEGORIA, type Subcategoria } from "@/lib/subcategorias/types";
import { SubcategoriasLista } from "./subcategorias-lista";

export default async function SubcategoriasPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("subcategorias").select(CAMPOS_SUBCATEGORIA);

  if (error) {
    return <p style={{ color: "var(--pdm-error)" }}>Não foi possível carregar as subcategorias. Recarregue a página.</p>;
  }

  // Quantos produtos usam cada subcategoria (um select só, contado aqui). A
  // lista de produtos é pequena (centenas); a API devolve no máximo 1.000
  // linhas por consulta, então este número deixa de valer se o catálogo
  // passar disso.
  const { data: ligados } = await supabase.from("produtos").select("subcategoria_id").not("subcategoria_id", "is", null);
  const produtosPorSubcategoria: Record<string, number> = {};
  for (const linha of (ligados ?? []) as { subcategoria_id: string }[]) {
    produtosPorSubcategoria[linha.subcategoria_id] = (produtosPorSubcategoria[linha.subcategoria_id] ?? 0) + 1;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div className="admin-page-header">
        <h1 className="admin-page-h1" style={{ fontFamily: "var(--font-heading)", fontSize: 32, lineHeight: 1.3, margin: 0, color: "var(--pdm-brown)" }}>
          Subcategorias
        </h1>
        <p style={{ margin: "4px 0 0", color: "var(--pdm-muted)", maxWidth: "70ch" }}>
          Agrupam os produtos dentro de cada categoria. Cada produto tem uma subcategoria ou nenhuma, e a escolha é feita no
          cadastro do produto. Subcategoria desativada não aparece para o cliente, mas os produtos continuam ligados a ela.
        </p>
      </div>
      <SubcategoriasLista
        subcategorias={(data ?? []) as unknown as Subcategoria[]}
        produtosPorSubcategoria={produtosPorSubcategoria}
      />
    </div>
  );
}
