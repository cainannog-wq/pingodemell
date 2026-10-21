"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ds";

// Menu de 3 pontinhos do card mobile de subcategoria (mesmo contrato do menu
// de produtos): fecha ao clicar fora e com Esc, o foco vai ao primeiro item
// ao abrir e volta ao botão ao fechar.
export function SubcategoriaMenu({
  nome,
  onRenomear,
  onApagar,
}: {
  nome: string;
  onRenomear: () => void;
  onApagar: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const envoltorio = useRef<HTMLDivElement>(null);
  const gatilho = useRef<HTMLButtonElement>(null);
  const primeiro = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!aberto) return;
    primeiro.current?.focus();
    function fora(e: MouseEvent) {
      if (envoltorio.current && !envoltorio.current.contains(e.target as Node)) setAberto(false);
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setAberto(false);
        gatilho.current?.focus();
      }
    }
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", tecla);
    };
  }, [aberto]);

  function item(fn: () => void) {
    setAberto(false);
    gatilho.current?.focus();
    fn();
  }

  const itens: { texto: string; icone: "edit" | "delete"; ativo: boolean; fn: () => void; perigo?: boolean }[] = [
    { texto: "Renomear", icone: "edit", ativo: true, fn: onRenomear },
    { texto: "Apagar", icone: "delete", ativo: true, fn: onApagar, perigo: true },
  ];
  const primeiroAtivo = itens.findIndex((i) => i.ativo);

  return (
    <div ref={envoltorio} className="produto-action-menu-wrap">
      <button
        ref={gatilho}
        type="button"
        className="produto-action-menu-btn"
        aria-label={`Ações de ${nome}`}
        aria-haspopup="menu"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
      >
        <Icon name="more_vert" size={22} />
      </button>
      {aberto ? (
        <div role="menu" aria-label={`Ações de ${nome}`} className="produto-action-menu-panel" style={{ minWidth: 180 }}>
          {itens.map((i, n) => (
            <button
              key={i.texto}
              ref={n === primeiroAtivo ? primeiro : undefined}
              type="button"
              role="menuitem"
              disabled={!i.ativo}
              className={`produto-action-menu-item${i.perigo ? " produto-action-menu-item--danger" : ""}`}
              style={i.ativo ? undefined : { opacity: 0.4, cursor: "default" }}
              onClick={() => item(i.fn)}
            >
              <Icon name={i.icone} size={20} color={i.perigo ? "var(--pdm-error)" : undefined} />
              {i.texto}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
