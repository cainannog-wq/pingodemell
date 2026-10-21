import { createClient } from "@/lib/supabase/server";
import { ordenarItens, type ItemDaLista, type Lista } from "@/lib/kit/listas";
import { KitListasEditor } from "./kit-listas-editor";

export default async function KitListasPage() {
  const supabase = await createClient();
  const [listas, itens] = await Promise.all([
    supabase.from("kit_listas").select("id, nome").order("nome"),
    supabase.from("kit_lista_itens").select("id, lista_id, nome, descricao, posicao, ativo"),
  ]);

  if (listas.error || itens.error) {
    return <p style={{ color: "var(--pdm-error)" }}>Não foi possível carregar as listas do kit. Recarregue a página.</p>;
  }

  const todas = (itens.data ?? []) as ItemDaLista[];
  const dados: Lista[] = ((listas.data ?? []) as { id: string; nome: string }[]).map((l) => ({
    ...l,
    itens: ordenarItens(todas.filter((i) => i.lista_id === l.id)),
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div className="admin-page-header">
        <h1 className="admin-page-h1" style={{ fontFamily: "var(--font-heading)", fontSize: 32, lineHeight: 1.3, margin: 0, color: "var(--pdm-brown)" }}>
          Listas do kit
        </h1>
        <p style={{ margin: "4px 0 0", color: "var(--pdm-muted)", maxWidth: "70ch" }}>
          As opções que a cliente escolhe nos Kits Festa por pessoa (recheios do bolo, doces, fritos, assados, sanduíches e
          bebidas). A lista é a mesma para os três kits. Opção desativada some para a cliente; quantidades já gravadas continuam.
        </p>
      </div>
      <KitListasEditor listas={dados} />
    </div>
  );
}
