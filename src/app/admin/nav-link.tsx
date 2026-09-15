"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { Icon } from "@/components/ds";
import { ADMIN_NAV_TOGGLE_ID } from "./nav-toggle";

// A gaveta de navegação do mobile é um checkbox puro em CSS (sem estado em
// React), então ela não fecha sozinha ao navegar — o layout não remonta
// entre páginas. Fecha manualmente a cada troca de rota.
function useCloseMobileNavOnNavigate(pathname: string) {
  useEffect(() => {
    const toggle = document.getElementById(ADMIN_NAV_TOGGLE_ID) as HTMLInputElement | null;
    if (toggle) toggle.checked = false;
  }, [pathname]);
}

export function NavLink({
  href,
  icon,
  exact = false,
  excludePrefix,
  children,
}: {
  href: string;
  icon: string;
  /** Match only the exact path, instead of any path under `href`. */
  exact?: boolean;
  /** When not exact, treat paths under this prefix as NOT active (e.g. a more specific sibling route). */
  excludePrefix?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  useCloseMobileNavOnNavigate(pathname);
  const active = exact
    ? pathname === href
    : (pathname === href || pathname.startsWith(href + "/")) &&
      !(excludePrefix && pathname.startsWith(excludePrefix));

  return (
    <Link
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        textAlign: "left",
        minHeight: 44,
        padding: "0 12px",
        borderRadius: "var(--radius)",
        background: active ? "var(--pdm-gold)" : "transparent",
        fontFamily: "var(--font-body)",
        fontSize: 16,
        fontWeight: active ? 700 : 400,
        color: active ? "var(--pdm-black)" : "var(--pdm-white)",
        transition: "var(--transition-base)",
      }}
    >
      <Icon name={icon} size={22} tone="inherit" />
      {children}
    </Link>
  );
}
