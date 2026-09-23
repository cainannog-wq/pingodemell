"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ds";

// Menu de 3 pontinhos do card mobile de produto (reorganização de
// listagem de 22/09/2026). Contrato de acessibilidade pedido: fecha ao
// clicar fora e com Esc, foco vai pro primeiro item ao abrir, volta pro
// botão de gatilho ao fechar, aria-label descreve o produto.
export function ProductActionMenu({
  nome,
  ativo,
  destaque,
  editHref,
  onToggleAtivo,
  onToggleDestaque,
  onDelete,
}: {
  nome: string;
  ativo: boolean;
  destaque: boolean;
  editHref: string;
  onToggleAtivo: () => void;
  onToggleDestaque: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!open) return;
    firstItemRef.current?.focus();

    function handlePointerDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function closeAnd(fn: () => void) {
    setOpen(false);
    triggerRef.current?.focus();
    fn();
  }

  return (
    <div ref={wrapRef} className="produto-action-menu-wrap">
      <button
        ref={triggerRef}
        type="button"
        className="produto-action-menu-btn"
        aria-label={`Ações de ${nome}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <Icon name="more_vert" size={22} />
      </button>

      {open ? (
        <div role="menu" aria-label={`Ações de ${nome}`} className="produto-action-menu-panel">
          <Link
            ref={firstItemRef}
            href={editHref}
            role="menuitem"
            className="produto-action-menu-item"
            onClick={(e) => e.stopPropagation()}
          >
            <Icon name="edit" size={20} />
            Editar
          </Link>
          <button
            type="button"
            role="menuitem"
            className="produto-action-menu-item"
            onClick={(e) => {
              e.stopPropagation();
              closeAnd(onToggleAtivo);
            }}
          >
            <Icon name={ativo ? "toggle_off" : "toggle_on"} size={20} />
            {ativo ? "Desativar produto" : "Ativar produto"}
          </button>
          <button
            type="button"
            role="menuitem"
            className="produto-action-menu-item"
            onClick={(e) => {
              e.stopPropagation();
              closeAnd(onToggleDestaque);
            }}
          >
            <Icon name="check_circle" size={20} />
            {destaque ? "Remover destaque" : "Marcar destaque"}
          </button>
          <div className="produto-action-menu-divider" />
          <button
            type="button"
            role="menuitem"
            className="produto-action-menu-item produto-action-menu-item--danger"
            onClick={(e) => {
              e.stopPropagation();
              closeAnd(onDelete);
            }}
          >
            <Icon name="delete" size={20} color="var(--pdm-error)" />
            Excluir
          </button>
        </div>
      ) : null}
    </div>
  );
}
