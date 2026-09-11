import { createClient } from "@/lib/supabase/server";
import type { Pedido } from "@/lib/pedidos/types";
import { brasiliaAnoMes } from "@/lib/pedidos/format";
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
  // dois lados (servidor em UTC, navegador em horário de Brasília) e
  // arriscar um card piscando um número diferente na hidratação.
  const mesAtual = brasiliaAnoMes(new Date().toISOString());
  const pedidosDoMes = rows.filter((p) => brasiliaAnoMes(p.criado_em) === mesAtual);

  const stats = {
    pedidosNoMes: pedidosDoMes.length,
    aguardandoConfirmacao: rows.filter((p) => p.status === "aguardando_confirmacao").length,
    entregues: rows.filter((p) => p.status === "entregue").length,
    valorNoMes: pedidosDoMes
      .filter((p) => p.status !== "cancelado")
      .reduce((soma, p) => soma + p.total, 0),
  };

  return <PedidosList pedidos={rows} stats={stats} />;
}
