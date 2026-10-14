import Link from "next/link";
import type { CategoriaProduto } from "@/lib/produtos/types";
import { urlDaLista } from "@/lib/site/rotas";
import { CATEGORIAS_DA_LISTA, ORDEM_PADRAO, type OrdemLista } from "@/lib/vitrine/lista";

// Filtro de categorias da Lista. São links comuns pra URL de cada filtro
// (/produtos e /produtos?categoria=...), não botões com estado: funciona
// sem JavaScript, o voltar do navegador desfaz o filtro e o link filtrado
// pode ser compartilhado. A opção atual é anunciada com aria-current.
// Desktop: card lateral "Categorias" (o card é o .lista-filtro da página, que
// também guarda o filtro de subcategorias logo depois); mobile: linha de
// chips com rolagem lateral (só CSS muda, o HTML é o mesmo).
//
// Trocar de categoria mantém a busca e a ordem e volta para a página 1.
// "Mais pedidos" só existe em "Todos": o link de uma categoria volta para
// Recomendados.
export function FiltroCategorias({
  ativa,
  busca = "",
  ordem = ORDEM_PADRAO,
}: {
  ativa: CategoriaProduto | null;
  busca?: string;
  ordem?: OrdemLista;
}) {
  const opcoes = [
    { chave: "todos", categoria: null, href: urlDaLista({ busca, ordem }) },
    ...CATEGORIAS_DA_LISTA.map((c) => ({
      chave: c,
      categoria: c,
      href: urlDaLista({ categoria: c, busca, ordem: ordem === "mais-pedidos" ? ORDEM_PADRAO : ordem }),
    })),
  ];

  return (
    <nav className="lista-filtro-nav" aria-labelledby="lista-filtro-titulo">
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
