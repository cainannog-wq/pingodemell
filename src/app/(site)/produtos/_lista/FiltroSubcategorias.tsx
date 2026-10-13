import Link from "next/link";
import type { CategoriaProduto } from "@/lib/produtos/types";
import { urlDaSubcategoria, type ChipSubcategoria, type OrdemLista } from "@/lib/vitrine/lista";

// Filtro por subcategoria da Lista: "Todas" e uma opção por subcategoria da
// categoria escolhida. Links comuns renderizados no servidor (funcionam sem
// JavaScript, o voltar do navegador desfaz o filtro e a URL filtrada pode ser
// compartilhada); a opção atual é anunciada com aria-current e também se
// distingue por sublinhado e peso, não só pela cor. Trocar a opção mantém
// categoria, busca e ordem e volta para a página 1 (urlDaSubcategoria).
// Sem chips (categoria sem subcategoria com produto, ou "Todos"), nada aparece.
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
  const parametros = { categoria, busca, ordem };
  const opcoes = [{ chave: "todas", nome: "Todas", slug: null }, ...chips.map((c) => ({ chave: c.id, nome: c.nome, slug: c.slug }))];

  return (
    <nav className="lista-subfiltro" aria-label={`Subcategorias de ${categoria}`}>
      <ul className="lista-subfiltro-opcoes" role="list">
        {opcoes.map((opcao) => (
          <li key={opcao.chave}>
            <Link
              href={urlDaSubcategoria(parametros, opcao.slug)}
              className="lista-subfiltro-link"
              aria-current={opcao.slug === ativa ? "page" : undefined}
            >
              {opcao.nome}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
