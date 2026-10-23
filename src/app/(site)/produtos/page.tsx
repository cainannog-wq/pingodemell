import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { cache } from "react";
import { FiltroCategorias } from "@/components/site/FiltroCategorias";
import { Hive } from "@/components/site/Hive";
import { ROTAS, urlDaLista } from "@/lib/site/rotas";
import { SEO_CATEGORIAS, metadadosIndexaveis } from "@/lib/site/seo";
import { buscarDadosDaLista } from "@/lib/vitrine/buscar";
import { categoriaDoParametroAntigo, lerParametrosDaLista, montarLista, opcoesDeSubcategoria } from "@/lib/vitrine/lista";
import { BuscaEOrdem } from "./_lista/BuscaEOrdem";
import { FiltroSubcategorias } from "./_lista/FiltroSubcategorias";
import { ListaProdutos } from "./_lista/ListaProdutos";
import { Paginacao } from "./_lista/Paginacao";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const DESCRICAO =
  "Bolos, doces, salgados e kits feitos sob encomenda pela Pingo de Mell. Escolha, monte o pedido e a gente combina o resto no WhatsApp.";

// Uma leitura só por requisição, dividida entre generateMetadata e a página.
const carregar = cache(buscarDadosDaLista);

// Categoria da Lista com pelo menos 1 produto ativo e disponível: título,
// descrição e canonical da categoria. Categoria sem produto, valor inválido
// (inclusive adicionais e bebidas, fora da Lista), ausente ou falha do
// banco: os da Lista, com canonical /produtos. Busca, ordem, página e
// subcategoria nunca mudam título, descrição, canonical nem robots (a
// URL filtrada aponta para a da categoria).
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { categoria } = lerParametrosDaLista(await searchParams);
  if (categoria) {
    const dados = await carregar();
    if (dados && montarLista(dados.produtos, { categoria, busca: "", ordem: "recomendados", pagina: 1 }).total > 0) {
      return metadadosIndexaveis({ ...SEO_CATEGORIAS[categoria], caminho: ROTAS.listaPorCategoria(categoria) });
    }
  }
  return metadadosIndexaveis({ titulo: "Produtos · Pingo de Mell", descricao: DESCRICAO, caminho: ROTAS.lista });
}

// Lista de produtos (página 2 do site). Tudo pela URL, para abrir igual a
// partir de um link colado: ?categoria= (bolos, doces, salgados, kit-festa ou
// bento-cake; qualquer outro valor mostra "Todos"), ?subcategoria= (slug de
// uma subcategoria da categoria escolhida; qualquer outro valor mostra
// todas), ?busca=, ?ordem= (recomendados, mais-pedidos, a-z, z-a) e ?pagina=
// (24 por página).
export default async function ListaPage({ searchParams }: Props) {
  const busca = await searchParams;
  const parametros = lerParametrosDaLista(busca);
  // Link de fora com o endereço antigo da categoria (?categoria=kits): 308
  // para o atual, mantendo subcategoria, busca, ordem e página.
  const antiga = categoriaDoParametroAntigo(busca.categoria);
  if (antiga) permanentRedirect(urlDaLista({ ...parametros, categoria: antiga }));
  const dados = await carregar();
  const resultado = dados ? montarLista(dados.produtos, parametros, dados.subcategorias) : null;

  return (
    <>
      <section className="lista-topo">
        <Hive />
        <div className="site-container lista-topo-inner">
          <h1>Nosso catálogo</h1>
          <p className="lista-topo-lead site-so-desktop">
            Tudo feito sob encomenda. Escolha, monte o pedido e a gente combina o resto no WhatsApp.
          </p>
        </div>
      </section>

      <div className="site-container lista-corpo">
        {/* Categorias e subcategorias no mesmo bloco, nesta ordem do HTML (a
            ordem de leitura e do Tab é a da tela em qualquer largura): no
            desktop as subcategorias moram dentro da categoria escolhida; até
            1023 px, aqui, em chips logo depois das categorias. */}
        <div className="lista-filtro">
          <FiltroCategorias
            ativa={parametros.categoria}
            busca={parametros.busca}
            ordem={resultado?.ordem ?? parametros.ordem}
            subcategorias={
              resultado
                ? {
                    opcoes: opcoesDeSubcategoria(
                      { categoria: parametros.categoria, busca: parametros.busca, ordem: resultado.ordem },
                      resultado.chips,
                      resultado.subcategoriaAtiva
                    ),
                    comFiltro: resultado.categoriasComFiltro,
                  }
                : undefined
            }
          />
          {resultado ? (
            <FiltroSubcategorias
              categoria={parametros.categoria}
              chips={resultado.chips}
              ativa={resultado.subcategoriaAtiva}
              busca={parametros.busca}
              ordem={resultado.ordem}
            />
          ) : null}
        </div>
        <div className="lista-conteudo">
          {resultado ? (
            <BuscaEOrdem
              categoria={parametros.categoria}
              subcategoria={resultado.subcategoriaNaUrl}
              busca={parametros.busca}
              ordem={resultado.ordem}
              maisPedidosDisponivel={resultado.maisPedidosDisponivel}
            />
          ) : null}
          <ListaProdutos parametros={parametros} resultado={resultado} />
          {resultado ? (
            <Paginacao
              parametros={{ ...parametros, subcategoria: resultado.subcategoriaNaUrl, ordem: resultado.ordem }}
              resultado={resultado}
            />
          ) : null}
        </div>
      </div>
    </>
  );
}
