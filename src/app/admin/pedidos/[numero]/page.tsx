import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Pedido } from "@/lib/pedidos/types";
import { Icon, Button } from "@/components/ds";
import { PedidoDetail } from "./pedido-detail";

export default async function DetalhePedidoPage({
  params,
}: {
  params: Promise<{ numero: string }>;
}) {
  const { numero } = await params;
  const numeroPedido = Number(numero);

  const supabase = await createClient();
  const { data: pedido } = Number.isFinite(numeroPedido)
    ? await supabase.from("pedidos").select("*").eq("numero", numeroPedido).maybeSingle<Pedido>()
    : { data: null };

  if (!pedido) {
    return (
      <div
        style={{
          padding: "80px 24px",
          display: "grid",
          placeItems: "center",
          textAlign: "center",
          background: "var(--pdm-cream-warm)",
          borderRadius: "var(--radius)",
        }}
      >
        <div style={{ maxWidth: "46ch", display: "grid", justifyItems: "center", gap: 16 }}>
          <Icon name="search_off" size={40} tone="accent" />
          <h3 style={{ fontFamily: "var(--font-heading)", fontSize: 24, lineHeight: 1.4, margin: 0, color: "var(--pdm-brown)" }}>
            Pedido #{numero} não encontrado
          </h3>
          <p style={{ margin: 0, color: "var(--pdm-muted)" }}>Ele pode ter sido removido.</p>
          <Link href="/admin/pedidos">
            <Button variant="secondary">Voltar ao histórico</Button>
          </Link>
        </div>
      </div>
    );
  }

  return <PedidoDetail pedido={pedido} />;
}
