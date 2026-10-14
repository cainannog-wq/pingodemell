import Link from "next/link";
import type { CategoriaProduto } from "@/lib/produtos/types";
import { opcoesDeSubcategoria, type ChipSubcategoria, type OrdemLista } from "@/lib/vitrine/lista";

// Filtro por subcategoria da Lista em chips com rolagem lateral, para o
// celular e o tablet (até 1023 px); a partir de 1024 px as subcategorias
// ficam aninhadas na categoria escolhida, dentro do box "Categorias"
// (components/site/CategoriaComSubcategorias), e este bloco some por CSS
// (display: none, fora da árvore de acessibilidade e da ordem do Tab).
//
// "Todos" e uma opção por subcategoria da categoria escolhida. Links comuns
// renderizados no servidor (funcionam sem JavaScript, o voltar do navegador
// desfaz o filtro e a URL filtrada pode ser compartilhada); a opção atual é
// anunciada com aria-current e também se distingue por sublinhado e peso, não
// só pela cor. Trocar a opção mantém categoria, busca e ordem e volta para a
// página 1 (urlDaSubcategoria). Sem chips (categoria sem subcategoria com
// produto, ou "Todos"), nada aparece.
export function FiltroSubcategorias({
  categoria,
  chips,
  ativa,
  busca,
  ordem,
}: {
  categoria: CategoriaProduto | null;
  chips: ChipSubcategoria[];
  ativa: string | null;
  busca: string;
  ordem: OrdemLista;
}) {
  if (!categoria || chips.length === 0) return null;
  const opcoes = opcoesDeSubcategoria({ categoria, busca, ordem }, chips, ativa);

  return (
    <nav className="lista-subfiltro" aria-label={`Subcategorias de ${categoria}`}>
      <ul className="lista-subfiltro-opcoes" role="list">
        {opcoes.map((o) => (
          <li key={o.chave}>
            <Link href={o.href} className="lista-subfiltro-link" aria-current={o.atual ? "page" : undefined}>
              {o.nome}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
