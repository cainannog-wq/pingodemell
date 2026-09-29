"use client";

import { usePathname } from "next/navigation";

function labelFor(pathname: string): string {
  if (pathname === "/admin/recheios/novo") return "Cardápio · Novo recheio";
  if (pathname.startsWith("/admin/recheios/")) return "Cardápio · Editar recheio";
  if (pathname === "/admin/recheios") return "Cardápio · Recheios";
  if (pathname === "/admin/produtos/novo") return "Cardápio · Novo produto";
  if (pathname.startsWith("/admin/produtos/")) return "Cardápio · Editar produto";
  if (pathname.startsWith("/admin/pedidos/")) return "Pedidos · Detalhe do pedido";
  if (pathname === "/admin/pedidos") return "Pedidos · Histórico";
  return "Cardápio · Produtos";
}

export function Crumb() {
  const pathname = usePathname();
  return (
    <div style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 700, color: "var(--pdm-brown)" }}>
      {labelFor(pathname)}
    </div>
  );
}
