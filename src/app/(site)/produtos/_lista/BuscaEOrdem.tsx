"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Icon } from "@/components/ds";
import type { CategoriaProduto } from "@/lib/produtos/types";
import { categoriaParaParametro, ROTAS, urlDaLista } from "@/lib/site/rotas";
import { MAX_BUSCA } from "@/lib/vitrine/busca";
import { ORDENS, type OrdemLista } from "@/lib/vitrine/lista";

// Busca pelo nome e ordem da Lista, discretos (campo de borda fina com a
// lupa à direita; ordem como texto, sem caixa). Um formulário GET comum
// para /produtos: sem JavaScript, Enter no campo ou a lupa enviam busca,
// ordem e categoria (campo escondido) e a página abre já filtrada. Com
// JavaScript, o envio monta a URL limpa (sem valor padrão, urlDaLista) e
// navega sem recarregar; trocar a ordem aplica na hora. Os dois caminhos
// voltam para a página 1 (a página nunca vai no formulário).
export function BuscaEOrdem({
  categoria,
  busca,
  ordem,
  maisPedidosDisponivel,
}: {
  categoria: CategoriaProduto | null;
  busca: string;
  ordem: OrdemLista;
  maisPedidosDisponivel: boolean;
}) {
  // A chave remonta o formulário quando a URL muda (voltar do navegador,
  // filtro de categoria): campo e seletor sempre iguais ao que está na tela.
  return (
    <Formulario
      key={`${categoria ?? ""}|${busca}|${ordem}`}
      categoria={categoria}
      busca={busca}
      ordem={ordem}
      maisPedidosDisponivel={maisPedidosDisponivel}
    />
  );
}

function Formulario({
  categoria,
  busca,
  ordem,
  maisPedidosDisponivel,
}: {
  categoria: CategoriaProduto | null;
  busca: string;
  ordem: OrdemLista;
  maisPedidosDisponivel: boolean;
}) {
  const router = useRouter();
  const [texto, setTexto] = useState(busca);
  const ordens = ORDENS.filter((o) => o.valor !== "mais-pedidos" || maisPedidosDisponivel);

  function ir(novaBusca: string, novaOrdem: string) {
    router.push(urlDaLista({ categoria, busca: novaBusca, ordem: novaOrdem }));
  }

  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const dados = new FormData(e.currentTarget);
    ir(String(dados.get("busca") ?? ""), String(dados.get("ordem") ?? ordem));
  }

  return (
    <form className="lista-busca" role="search" action={ROTAS.lista} method="get" onSubmit={enviar}>
      {categoria ? <input type="hidden" name="categoria" value={categoriaParaParametro(categoria)} /> : null}
      <div className="lista-busca-campo">
        <label htmlFor="lista-busca" className="site-visually-hidden">
          Buscar produto pelo nome
        </label>
        <input
          id="lista-busca"
          name="busca"
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          maxLength={MAX_BUSCA}
          placeholder="Buscar pelo nome"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        {texto ? (
          <button
            type="button"
            className="lista-busca-icone"
            aria-label="Limpar busca"
            onClick={() => {
              setTexto("");
              // Com uma busca valendo na tela, limpar já mostra tudo de novo.
              if (busca) ir("", ordem);
            }}
          >
            <Icon name="close" size={18} tone="inherit" />
          </button>
        ) : null}
        <button type="submit" className="lista-busca-icone" aria-label="Buscar">
          <Icon name="search" size={22} tone="inherit" />
        </button>
      </div>
      <div className="lista-ordem">
        <Icon name="swap_vert" size={18} tone="inherit" />
        <label htmlFor="lista-ordem">
          Ordenar por<span aria-hidden="true">:</span>
        </label>
        <span className="lista-ordem-escolha">
          <select id="lista-ordem" name="ordem" defaultValue={ordem} onChange={(e) => ir(busca, e.target.value)}>
            {ordens.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </select>
          <Icon name="expand_more" size={20} tone="inherit" />
        </span>
      </div>
    </form>
  );
}
