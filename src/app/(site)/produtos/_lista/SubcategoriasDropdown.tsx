"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Icon } from "@/components/ds";

export type OpcaoSubcategoria = { chave: string; nome: string; href: string; atual: boolean };

// Dropdown de subcategorias do desktop (a partir de 768 px), dentro do box
// "Categorias". É um disclosure nativo (<details>/<summary>) com links reais:
// sem JavaScript abre e fecha pelo próprio navegador, e os links já vêm no
// HTML do servidor. O JavaScript só acrescenta o que o navegador não faz
// sozinho: fechar ao escolher uma opção, com Esc (devolvendo o foco ao
// botão) e ao clicar fora. Quem monta a lista e os endereços é o servidor
// (FiltroSubcategorias).
export function SubcategoriasDropdown({
  rotulo,
  atual,
  opcoes,
}: {
  rotulo: string;
  atual: string;
  opcoes: OpcaoSubcategoria[];
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const fechar = (devolverFoco: boolean) => {
      const d = ref.current;
      if (!d?.open) return;
      d.open = false;
      if (devolverFoco) d.querySelector("summary")?.focus();
    };
    const aoTecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") fechar(true);
    };
    const aoClicar = (e: PointerEvent) => {
      if (ref.current && e.target instanceof Node && !ref.current.contains(e.target)) fechar(false);
    };
    document.addEventListener("keydown", aoTecla);
    document.addEventListener("pointerdown", aoClicar);
    return () => {
      document.removeEventListener("keydown", aoTecla);
      document.removeEventListener("pointerdown", aoClicar);
    };
  }, []);

  return (
    <details className="lista-subdrop" ref={ref}>
      <summary className="lista-subdrop-botao">
        <span className="lista-subdrop-texto">
          <span className="lista-subdrop-rotulo">{rotulo}:</span> <span className="lista-subdrop-valor">{atual}</span>
        </span>
        <Icon name="expand_more" size={22} tone="inherit" className="lista-subdrop-seta" />
      </summary>
      <ul className="lista-subdrop-lista" role="list">
        {opcoes.map((o) => (
          <li key={o.chave}>
            <Link
              href={o.href}
              className="lista-subdrop-link"
              aria-current={o.atual ? "page" : undefined}
              onClick={() => {
                if (ref.current) ref.current.open = false;
              }}
            >
              {o.nome}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}
