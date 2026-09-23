import type { Metadata } from "next";
import { FiltroCategorias } from "@/components/site/FiltroCategorias";
import { Hive } from "@/components/site/Hive";
import { buscarLista } from "@/lib/vitrine/buscar";
import { categoriaDoParametro } from "@/lib/vitrine/lista";
import { ListaProdutos } from "./_lista/ListaProdutos";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const DESCRICAO =
  "Bolos, doces, salgados e bebidas feitos sob encomenda pela Pingo de Mell. Escolha, monte o pedido e a gente combina o resto no WhatsApp.";

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const categoria = categoriaDoParametro((await searchParams).categoria);
  return {
    title: categoria ? `${categoria} · Produtos · Pingo de Mell` : "Produtos · Pingo de Mell",
    description: DESCRICAO,
  };
}

// Lista de produtos (página 2 do site). Filtro por categoria na URL, no
// formato de ROTAS.listaPorCategoria (?categoria=bolos|doces|salgados|
// bebidas); qualquer outro valor mostra "Todos".
export default async function ListaPage({ searchParams }: Props) {
  const categoria = categoriaDoParametro((await searchParams).categoria);
  const itens = await buscarLista(categoria);

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
