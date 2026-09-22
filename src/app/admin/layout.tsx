import Image from "next/image";
import type { ReactNode } from "react";
import { requireAuth } from "@/lib/supabase/dal";
import { Button, Icon } from "@/components/ds";
import { NavLink } from "./nav-link";
import { logout } from "./actions";
import { Crumb } from "./crumb";
import { MobileHeaderNav } from "./mobile-header-nav";
import { ADMIN_NAV_TOGGLE_ID } from "./nav-toggle";
import "./admin.css";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireAuth();
  const displayName = user.email ?? "Equipe";
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <div
      className="admin-shell"
      style={{
        fontFamily: "var(--font-body)",
        color: "var(--pdm-black)",
        background: "var(--pdm-cream)",
        fontSize: 16,
        lineHeight: 1.6,
      }}
    >
      <input type="checkbox" id={ADMIN_NAV_TOGGLE_ID} className="admin-nav-toggle-input" aria-hidden="true" tabIndex={-1} />
      <label htmlFor={ADMIN_NAV_TOGGLE_ID} className="admin-nav-scrim" aria-hidden="true" />

      <aside className="admin-sidebar" style={{ background: "var(--gradient-brand)", color: "var(--pdm-white)" }}>
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
            Calendário
          </div>
          <NavLink href="/admin/dias-off" icon="event_busy">
            Dias sem produção
          </NavLink>
        </nav>

        <div className="admin-sidebar-footer">
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: "var(--pdm-gold)",
                display: "grid",
                placeItems: "center",
                fontWeight: 700,
                fontSize: 14,
                color: "var(--pdm-black)",
                flexShrink: 0,
              }}
            >
              {initials}
            </div>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName}</span>
          </div>
          <form action={logout}>
            <button
              type="submit"
              aria-label="Sair"
              title="Sair"
              style={{
                width: 44,
                height: 44,
                display: "grid",
                placeItems: "center",
                background: "transparent",
                border: "none",
                color: "var(--pdm-white)",
                cursor: "pointer",
                borderRadius: "var(--radius)",
              }}
            >
              <Icon name="logout" size={22} tone="inherit" />
            </button>
          </form>
        </div>
      </aside>

      <main style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <header className="admin-header">
          <div className="admin-header-crumb">
            <MobileHeaderNav />
            <div className="admin-header-crumb-text">
              <Crumb />
            </div>
          </div>
          <div className="admin-header-user admin-header-user-desktop">
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
                  flexShrink: 0,
                }}
              >
                {initials}
              </div>
              <span>{displayName}</span>
            </div>
            <div className="admin-header-divider" style={{ width: 1, height: 28, background: "var(--border-subtle)" }} />
            <form action={logout}>
              <Button type="submit" variant="ghost" size="sm" iconLeft="logout">
                Sair
              </Button>
            </form>
          </div>
          <div
            className="admin-header-user-mobile"
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "var(--pdm-gold)",
              display: "grid",
              placeItems: "center",
              fontWeight: 700,
              fontSize: 14,
              color: "var(--pdm-black)",
              flexShrink: 0,
            }}
          >
            {initials}
          </div>
        </header>

        <div className="admin-main-content" style={{ display: "flex", flexDirection: "column", gap: 32, flex: 1 }}>{children}</div>
      </main>
    </div>
  );
}
