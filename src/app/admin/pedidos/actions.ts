"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/supabase/dal";
import type { PedidoStatus } from "@/lib/pedidos/types";

// Transições manuais permitidas a partir do status atual — nenhuma delas
// é automática, todas exigem clique de alguém do time (ver Fase de
// escopo do painel de pedidos). "entregue" e "cancelado" são finais.
const TRANSICOES_VALIDAS: Record<PedidoStatus, PedidoStatus[]> = {
  aguardando_confirmacao: ["em_producao", "cancelado"],
  em_producao: ["entregue", "cancelado"],
  entregue: [],
  cancelado: [],
};

export async function atualizarStatusPedido(
  id: string,
  numero: number,
  statusAtual: PedidoStatus,
  novoStatus: PedidoStatus
) {
  await requireAuth();

  if (!TRANSICOES_VALIDAS[statusAtual]?.includes(novoStatus)) {
    throw new Error(`Pedido #${numero}: não é possível mudar de "${statusAtual}" para "${novoStatus}".`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pedidos")
    .update({ status: novoStatus })
    .eq("id", id)
    .eq("status", statusAtual)
    .select("id");

  if (error) {
    throw new Error(`Não foi possível atualizar o pedido #${numero}: ${error.message}`);
  }

  if (!data || data.length === 0) {
    throw new Error(`Pedido #${numero} já foi atualizado em outra aba. Atualize a página para ver o status atual.`);
  }

  revalidatePath("/admin/pedidos");
  revalidatePath(`/admin/pedidos/${numero}`);
}
