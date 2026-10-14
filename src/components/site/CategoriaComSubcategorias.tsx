"use client";

import Link from "next/link";
import { useId, useState, type MouseEvent } from "react";
import { Icon } from "@/components/ds";
import type { OpcaoSubcategoria } from "@/lib/vitrine/lista";

// Categoria escolhida que tem subcategorias, no desktop (box "Categorias"):
// o link da categoria com uma seta, e as subcategorias aninhadas logo abaixo,
// abertas. A lista vem inteira no HTML do servidor, com links reais: sem
// JavaScript ela fica sempre aberta e o link da categoria navega como sempre.
// Com JavaScript, clicar de novo na categoria já escolhida fecha e abre a
// lista (acordeão), sem recarregar. Clique com Ctrl, Cmd, Shift ou botão do
// meio segue o link normalmente. Em até 1023 px a lista fica escondida por CSS
// e valem os chips (FiltroSubcategorias).
export function CategoriaComSubcategorias({
  href,
  rotulo,
  opcoes,
}: {
  href: string;
  rotulo: string;
  opcoes: OpcaoSubcategoria[];
}) {
  const [aberto, setAberto] = useState(true);
  const id = useId();

  function aoClicar(e: MouseEvent<HTMLAnchorElement>) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    setAberto((a) => !a);
  }

  return (
    <>
      <Link
        href={href}
        className="lista-filtro-link lista-filtro-link--grupo"
        aria-current="page"
        aria-expanded={aberto}
        aria-controls={id}
        onClick={aoClicar}
      >
        {rotulo}
        <Icon name="expand_more" size={22} tone="inherit" className="lista-filtro-seta" />
      </Link>
      <ul id={id} className="lista-subgrupo" role="list" hidden={!aberto}>
        {opcoes.map((o) => (
          <li key={o.chave}>
            <Link href={o.href} className="lista-subgrupo-link" aria-current={o.atual ? "page" : undefined}>
              {o.nome}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
