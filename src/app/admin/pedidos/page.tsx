import { createClient } from "@/lib/supabase/server";
import type { Pedido } from "@/lib/pedidos/types";
import { resumirPedidos } from "@/lib/pedidos/resumo";
import { PedidosList } from "./pedidos-list";

export default async function PedidosPage() {
  const supabase = await createClient();
  const { data: pedidos, error } = await supabase
    .from("pedidos")
    .select("*")
    .order("criado_em", { ascending: false });

  if (error) {
    return (
      <p style={{ color: "var(--pdm-error)" }}>
        Não foi possível carregar os pedidos: {error.message}
      </p>
    );
  }

  const rows = (pedidos ?? []) as Pedido[];

  // Estatísticas calculadas aqui (Server Component, roda uma vez por
  // requisição) em vez de no client — evita recalcular "mês atual" nos
  // dois lados e arriscar um card piscando um número diferente na
  // hidratação. Duas versões: sem os pedidos de teste (padrão) e com eles
  // (quando o admin marca "Mostrar pedidos de teste").
  const stats = {
    semTeste: resumirPedidos(rows.filter((p) => !p.teste)),
    comTeste: resumirPedidos(rows),
  };

  return <PedidosList pedidos={rows} stats={stats} />;
}
