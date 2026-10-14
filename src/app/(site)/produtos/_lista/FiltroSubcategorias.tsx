import Link from "next/link";
import type { CategoriaProduto } from "@/lib/produtos/types";
import { urlDaSubcategoria, type ChipSubcategoria, type OrdemLista } from "@/lib/vitrine/lista";
import { SubcategoriasDropdown } from "./SubcategoriasDropdown";

// Filtro por subcategoria da Lista: "Todas" e uma opção por subcategoria da
// categoria escolhida. Links comuns renderizados no servidor (funcionam sem
// JavaScript, o voltar do navegador desfaz o filtro e a URL filtrada pode ser
// compartilhada); a opção atual é anunciada com aria-current e também se
// distingue por sublinhado e peso, não só pela cor. Trocar a opção mantém
// categoria, busca e ordem e volta para a página 1 (urlDaSubcategoria).
// Sem chips (categoria sem subcategoria com produto, ou "Todos"), nada aparece.
//
// Duas apresentações do MESMO filtro (mesmos dados, mesma função de endereço),
// no mesmo lugar do HTML, logo depois das categorias e antes da busca; só uma
// aparece por largura (a outra fica com display: none, fora da árvore de
// acessibilidade e da ordem do Tab):
// - desktop (768 px ou mais): dropdown dentro do box "Categorias";
// - celular (até 767 px): chips com rolagem lateral, com um rótulo curto para
//   não parecerem a linha de categorias.
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
  const opcoes = [{ chave: "todas", nome: "Todas", slug: null }, ...chips.map((c) => ({ chave: c.id, nome: c.nome, slug: c.slug }))].map((o) => ({
    chave: o.chave,
    nome: o.nome,
    href: urlDaSubcategoria(parametros, o.slug),
    atual: o.slug === ativa,
  }));
  const nomeDaAtual = opcoes.find((o) => o.atual)?.nome ?? "Todas";
  const rotuloDaNav = `Subcategorias de ${categoria}`;

  return (
    <>
      <nav className="lista-subfiltro lista-subfiltro--desktop" aria-label={rotuloDaNav}>
        {/* Remonta fechado quando a opção muda (navegação sem recarregar). */}
        <SubcategoriasDropdown key={ativa ?? "todas"} rotulo="Subcategoria" atual={nomeDaAtual} opcoes={opcoes} />
      </nav>
      <nav className="lista-subfiltro lista-subfiltro--celular" aria-label={rotuloDaNav}>
        <p className="lista-subfiltro-titulo" aria-hidden="true">
          Subcategorias
        </p>
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
    </>
  );
}
