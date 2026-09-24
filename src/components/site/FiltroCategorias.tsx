import Link from "next/link";
import type { CategoriaProduto } from "@/lib/produtos/types";
import { ROTAS } from "@/lib/site/rotas";
import { ORDEM_CATEGORIAS } from "@/lib/vitrine/lista";

// Filtro de categorias da Lista. São links comuns pra URL de cada filtro
// (/produtos e /produtos?categoria=...), não botões com estado: funciona
// sem JavaScript, o voltar do navegador desfaz o filtro e o link filtrado
// pode ser compartilhado. A opção atual é anunciada com aria-current.
// Desktop: card lateral "Categorias"; mobile: linha de chips com rolagem
// lateral (só CSS muda, o HTML é o mesmo).
export function FiltroCategorias({ ativa }: { ativa: CategoriaProduto | null }) {
  const opcoes = [
    { chave: "todos", categoria: null, href: ROTAS.lista },
    ...ORDEM_CATEGORIAS.map((c) => ({ chave: c, categoria: c, href: ROTAS.listaPorCategoria(c) })),
  ];

  return (
    <nav className="lista-filtro" aria-labelledby="lista-filtro-titulo">
      <p id="lista-filtro-titulo" className="lista-filtro-titulo">
        Categorias
      </p>
      <ul className="lista-filtro-opcoes" role="list">
        {opcoes.map((opcao) => {
          const atual = opcao.categoria === ativa;
          return (
            <li key={opcao.chave}>
              <Link href={opcao.href} className="lista-filtro-link" aria-current={atual ? "page" : undefined}>
                {opcao.categoria ?? (
                  <>
                    <span className="site-so-desktop">Todos os produtos</span>
                    <span className="site-so-mobile">Todos</span>
                  </>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
