import Link from "next/link";
import type { CategoriaProduto } from "@/lib/produtos/types";
import { urlDaLista } from "@/lib/site/rotas";
import { Icon } from "@/components/ds";
import { CATEGORIAS_DA_LISTA, ORDEM_PADRAO, type OpcaoSubcategoria, type OrdemLista } from "@/lib/vitrine/lista";
import { CategoriaComSubcategorias } from "./CategoriaComSubcategorias";

// Filtro de categorias da Lista. São links comuns pra URL de cada filtro
// (/produtos e /produtos?categoria=...), não botões com estado: funciona
// sem JavaScript, o voltar do navegador desfaz o filtro e o link filtrado
// pode ser compartilhado. A opção atual é anunciada com aria-current.
// Desktop: card lateral "Categorias" (o card é o .lista-filtro da página); a
// categoria escolhida que tem subcategorias as mostra aninhadas logo abaixo,
// como um acordeão (CategoriaComSubcategorias), e as outras com subcategorias
// levam uma seta. Mobile (até 1023 px): linha de chips com rolagem lateral;
// as subcategorias viram a segunda linha de chips (FiltroSubcategorias).
//
// Trocar de categoria mantém a busca e a ordem e volta para a página 1.
// "Mais pedidos" só existe em "Todos": o link de uma categoria volta para
// Recomendados.
export function FiltroCategorias({
  ativa,
  busca = "",
  ordem = ORDEM_PADRAO,
  subcategorias,
}: {
  ativa: CategoriaProduto | null;
  busca?: string;
  ordem?: OrdemLista;
  // Opções da categoria escolhida (vazio ou ausente = sem filtro) e as
  // categorias que têm filtro.
  subcategorias?: { opcoes: OpcaoSubcategoria[]; comFiltro: readonly CategoriaProduto[] };
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
          const comFiltro = opcao.categoria !== null && (subcategorias?.comFiltro ?? []).includes(opcao.categoria);
          if (atual && opcao.categoria && comFiltro && subcategorias && subcategorias.opcoes.length > 0) {
            return (
              <li key={opcao.chave}>
                <CategoriaComSubcategorias href={opcao.href} rotulo={opcao.categoria} opcoes={subcategorias.opcoes} />
              </li>
            );
          }
          return (
            <li key={opcao.chave}>
              <Link href={opcao.href} className={comFiltro ? "lista-filtro-link lista-filtro-link--grupo" : "lista-filtro-link"}
                aria-current={atual ? "page" : undefined}
              >
                {opcao.categoria ?? (
                  <>
                    <span className="site-so-desktop">Todos os produtos</span>
                    <span className="site-so-mobile">Todos</span>
                  </>
                )}
                {comFiltro ? <Icon name="expand_more" size={22} tone="inherit" className="lista-filtro-seta" /> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
