import Image from "next/image";
import type { ReactNode } from "react";
import { requireAuth } from "@/lib/supabase/dal";
import { Button } from "@/components/ds";
import { NavLink } from "./nav-link";
import { logout } from "./actions";
import { Crumb } from "./crumb";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireAuth();
  const displayName = user.email ?? "Equipe";
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <div
      style={{
        fontFamily: "var(--font-body)",
        color: "var(--pdm-black)",
        background: "var(--pdm-cream)",
        fontSize: 16,
        lineHeight: 1.6,
        display: "grid",
        gridTemplateColumns: "264px minmax(0, 1fr)",
        minHeight: "100dvh",
      }}
    >
      <aside style={{ background: "var(--gradient-brand)", color: "var(--pdm-white)", display: "flex", flexDirection: "column" }}>
        <div
          style={{
            padding: 24,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            borderBottom: "1px solid rgba(255,255,255,.22)",
          }}
        >
          <Image
            src="/logo-mono-cream.png"
            alt="Pingo de Mell"
            width={116}
            height={59}
            style={{ width: 116, height: "auto", display: "block" }}
          />
          <div style={{ fontSize: 13, color: "rgba(255,255,255,.92)" }}>Painel da equipe</div>
        </div>
        <nav style={{ padding: "24px 16px", display: "grid", gap: 8 }}>
          <div
            style={{
              fontSize: 13,
              textTransform: "uppercase",
              letterSpacing: ".05em",
              fontWeight: 700,
              color: "rgba(255,255,255,.8)",
              padding: "0 12px 4px",
            }}
          >
            Cardápio
          </div>
          <NavLink href="/admin/produtos" icon="cake" excludePrefix="/admin/produtos/novo">
            Produtos
          </NavLink>
          <NavLink href="/admin/produtos/novo" icon="add_circle" exact>
            Novo produto
          </NavLink>

          <div
            style={{
              fontSize: 13,
              textTransform: "uppercase",
              letterSpacing: ".05em",
              fontWeight: 700,
              color: "rgba(255,255,255,.8)",
              padding: "16px 12px 4px",
            }}
          >
            Pedidos
          </div>
          <NavLink href="/admin/pedidos" icon="receipt_long">
            Histórico de pedidos
          </NavLink>
        </nav>
      </aside>

      <main style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <header
          style={{
            minHeight: 72,
            background: "var(--pdm-white)",
            borderBottom: "1px solid var(--border-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 32px",
          }}
        >
          <Crumb />
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  background: "var(--pdm-gold)",
                  display: "grid",
                  placeItems: "center",
                  fontWeight: 700,
                  color: "var(--pdm-black)",
                }}
              >
                {initials}
              </div>
              <span>{displayName}</span>
            </div>
            <div style={{ width: 1, height: 28, background: "var(--border-subtle)" }} />
            <form action={logout}>
              <Button type="submit" variant="ghost" size="sm" iconLeft="logout">
                Sair
              </Button>
            </form>
          </div>
        </header>

        <div style={{ padding: 32, display: "flex", flexDirection: "column", gap: 32, flex: 1 }}>{children}</div>
      </main>
    </div>
  );
}
