import Link from "next/link";
import { Icon } from "@/components/ds";
import { urlDaLista } from "@/lib/site/rotas";
import { paginasVisiveis, type ParametrosLista, type ResultadoLista } from "@/lib/vitrine/lista";

// Paginação da Lista: links comuns (funcionam sem JavaScript e podem ser
// compartilhados), mantendo categoria, busca e ordem. Só aparece com mais
// de uma página. Números: primeira, última, atual e vizinhas
// (paginasVisiveis), o resto vira "…".
export function Paginacao({ parametros, resultado }: { parametros: ParametrosLista; resultado: ResultadoLista }) {
  const { pagina, totalPaginas } = resultado;
  if (totalPaginas <= 1) return null;

  const href = (n: number) => urlDaLista({ ...parametros, pagina: n });

  return (
    <nav className="lista-paginacao" aria-label="Páginas da lista">
      {pagina > 1 ? (
        <Link href={href(pagina - 1)} className="lista-paginacao-seta" aria-label="Página anterior">
          <Icon name="chevron_left" size={22} />
          <span className="site-so-desktop">Anterior</span>
        </Link>
      ) : (
        <span className="lista-paginacao-seta" aria-hidden="true" data-desligada="">
          <Icon name="chevron_left" size={22} />
          <span className="site-so-desktop">Anterior</span>
        </span>
      )}
      <ul role="list">
        {paginasVisiveis(pagina, totalPaginas).map((n, i) =>
          n === "…" ? (
            <li key={`r${i}`} className="lista-paginacao-reticencias" aria-hidden="true">
              …
            </li>
          ) : (
            <li key={n}>
              <Link
                href={href(n)}
                className="lista-paginacao-numero"
                aria-label={`Página ${n}`}
                aria-current={n === pagina ? "page" : undefined}
              >
                {n}
              </Link>
            </li>
          )
        )}
      </ul>
      {pagina < totalPaginas ? (
        <Link href={href(pagina + 1)} className="lista-paginacao-seta" aria-label="Próxima página">
          <span className="site-so-desktop">Próxima</span>
          <Icon name="chevron_right" size={22} />
        </Link>
      ) : (
        <span className="lista-paginacao-seta" aria-hidden="true" data-desligada="">
          <span className="site-so-desktop">Próxima</span>
          <Icon name="chevron_right" size={22} />
        </span>
      )}
    </nav>
  );
}
