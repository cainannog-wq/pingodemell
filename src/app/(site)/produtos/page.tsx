import type { Metadata } from "next";
import { cache } from "react";
import { FiltroCategorias } from "@/components/site/FiltroCategorias";
import { Hive } from "@/components/site/Hive";
import { ROTAS } from "@/lib/site/rotas";
import { SEO_CATEGORIAS, metadadosIndexaveis } from "@/lib/site/seo";
import { buscarProdutosDaLista } from "@/lib/vitrine/buscar";
import { lerParametrosDaLista, montarLista } from "@/lib/vitrine/lista";
import { BuscaEOrdem } from "./_lista/BuscaEOrdem";
import { ListaProdutos } from "./_lista/ListaProdutos";
import { Paginacao } from "./_lista/Paginacao";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const DESCRICAO =
  "Bolos, doces, salgados e kits feitos sob encomenda pela Pingo de Mell. Escolha, monte o pedido e a gente combina o resto no WhatsApp.";

// Uma leitura só por requisição, dividida entre generateMetadata e a página.
const carregar = cache(buscarProdutosDaLista);

// Categoria da Lista com pelo menos 1 produto ativo e disponível: título,
// descrição e canonical da categoria. Categoria sem produto, valor inválido
// (inclusive adicionais e bebidas, fora da Lista), ausente ou falha do
// banco: os da Lista, com canonical /produtos. Busca, ordem e página nunca
// mudam o canonical.
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { categoria } = lerParametrosDaLista(await searchParams);
  if (categoria) {
    const produtos = await carregar();
    if (produtos && montarLista(produtos, { categoria, busca: "", ordem: "recomendados", pagina: 1 }).total > 0) {
      return metadadosIndexaveis({ ...SEO_CATEGORIAS[categoria], caminho: ROTAS.listaPorCategoria(categoria) });
    }
  }
  return metadadosIndexaveis({ titulo: "Produtos · Pingo de Mell", descricao: DESCRICAO, caminho: ROTAS.lista });
}

// Lista de produtos (página 2 do site). Tudo pela URL, para abrir igual a
// partir de um link colado: ?categoria= (bolos, doces, salgados, kits ou
// bento-cake; qualquer outro valor mostra "Todos"), ?busca=, ?ordem=
// (recomendados, mais-pedidos, a-z, z-a) e ?pagina= (24 por página).
export default async function ListaPage({ searchParams }: Props) {
  const parametros = lerParametrosDaLista(await searchParams);
  const produtos = await carregar();
  const resultado = produtos ? montarLista(produtos, parametros) : null;

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
        <FiltroCategorias ativa={parametros.categoria} busca={parametros.busca} ordem={resultado?.ordem ?? parametros.ordem} />
        <div className="lista-conteudo">
          {resultado ? (
            <BuscaEOrdem
              categoria={parametros.categoria}
              busca={parametros.busca}
              ordem={resultado.ordem}
              maisPedidosDisponivel={resultado.maisPedidosDisponivel}
            />
          ) : null}
          <ListaProdutos parametros={parametros} resultado={resultado} />
          {resultado ? <Paginacao parametros={{ ...parametros, ordem: resultado.ordem }} resultado={resultado} /> : null}
        </div>
      </div>
    </>
  );
}
