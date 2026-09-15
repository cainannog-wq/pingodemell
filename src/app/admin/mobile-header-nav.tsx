"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ds";
import { ADMIN_NAV_TOGGLE_ID } from "./nav-toggle";

function secondLevelInfo(pathname: string): { backHref: string; title: string } | null {
  if (pathname === "/admin/produtos/novo") return { backHref: "/admin/produtos", title: "Novo produto" };
  if (pathname.startsWith("/admin/produtos/")) return { backHref: "/admin/produtos", title: "Editar produto" };
  const pedidoMatch = pathname.match(/^\/admin\/pedidos\/(.+)$/);
  if (pedidoMatch) return { backHref: "/admin/pedidos", title: `Pedido #${pedidoMatch[1]}` };
  return null;
}

// No mobile, o topbar mostra hambúrguer + logo nas telas de primeiro nível
// (Produtos, Histórico de pedidos) e seta de voltar + título nas telas de
// segundo nível (novo/editar produto, detalhe do pedido). No desktop esse
// componente inteiro fica escondido via CSS — a sidebar fixa não precisa
// disso, o breadcrumb (Crumb) continua sendo a referência de onde a pessoa
// está.
export function MobileHeaderNav() {
  const pathname = usePathname();
  const info = secondLevelInfo(pathname);

  if (info) {
    return (
      <>
        <Link href={info.backHref} className="admin-mobile-back" aria-label="Voltar">
          <Icon name="arrow_back" size={26} tone="inherit" />
        </Link>
        <span className="admin-mobile-title">{info.title}</span>
      </>
    );
  }

  return (
    <>
      <label htmlFor={ADMIN_NAV_TOGGLE_ID} className="admin-nav-toggle-btn" aria-label="Abrir menu">
        <Icon name="menu" size={26} tone="inherit" />
      </label>
      <Image src="/logo-mono-cream.png" alt="Pingo de Mell" width={92} height={47} className="admin-mobile-logo" />
    </>
  );
}
