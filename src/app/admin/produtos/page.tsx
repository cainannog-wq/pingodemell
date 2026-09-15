import { createClient } from "@/lib/supabase/server";
import type { Produto } from "@/lib/produtos/types";
import { ProdutosList } from "./produtos-list";

export default async function ProdutosPage() {
  const supabase = await createClient();
  const { data: produtos, error } = await supabase
    .from("produtos")
    .select("*")
    .order("nome", { ascending: true });

  if (error) {
    return (
      <p style={{ color: "var(--pdm-error)" }}>
        Não foi possível carregar os produtos: {error.message}
      </p>
    );
  }

  return <ProdutosList produtos={(produtos ?? []) as Produto[]} />;
}
