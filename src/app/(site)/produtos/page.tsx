import type { Metadata } from "next";
import { cache } from "react";
import { FiltroCategorias } from "@/components/site/FiltroCategorias";
import { Hive } from "@/components/site/Hive";
import { ROTAS } from "@/lib/site/rotas";
import { SEO_CATEGORIAS, metadadosIndexaveis } from "@/lib/site/seo";
import { buscarLista } from "@/lib/vitrine/buscar";
import { categoriaDoParametro } from "@/lib/vitrine/lista";
import { ListaProdutos } from "./_lista/ListaProdutos";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const DESCRICAO =
  "Bolos, doces, salgados e bebidas feitos sob encomenda pela Pingo de Mell. Escolha, monte o pedido e a gente combina o resto no WhatsApp.";

// Uma busca só por requisição, dividida entre generateMetadata e a página.
const carregar = cache(buscarLista);

// Categoria com pelo menos 1 produto ativo e disponível (o mesmo filtro que
// a Lista usa para mostrar): título, descrição e canonical da categoria.
// Categoria sem produto (hoje, Kits), valor inválido, ausente ou falha do
// banco: os da Lista, com canonical /produtos.
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const categoria = categoriaDoParametro((await searchParams).categoria);
  if (categoria) {
    const itens = await carregar(categoria);
    if (itens && itens.length > 0) {
      return metadadosIndexaveis({ ...SEO_CATEGORIAS[categoria], caminho: ROTAS.listaPorCategoria(categoria) });
    }
  }
  return metadadosIndexaveis({ titulo: "Produtos · Pingo de Mell", descricao: DESCRICAO, caminho: ROTAS.lista });
}

// Lista de produtos (página 2 do site). Filtro por categoria na URL, no
// formato de ROTAS.listaPorCategoria (?categoria=bolos|doces|salgados|
// bebidas); qualquer outro valor mostra "Todos".
export default async function ListaPage({ searchParams }: Props) {
  const categoria = categoriaDoParametro((await searchParams).categoria);
  const itens = await carregar(categoria);

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
        <FiltroCategorias ativa={categoria} />
        <ListaProdutos categoria={categoria} itens={itens} />
      </div>
    </>
  );
}
