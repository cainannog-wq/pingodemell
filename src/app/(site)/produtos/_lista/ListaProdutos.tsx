import { Icon, TextLink } from "@/components/ds";
import { CardProduto } from "@/components/site/CardProduto";
import type { CategoriaProduto } from "@/lib/produtos/types";
import { ROTAS } from "@/lib/site/rotas";
import type { ItemLista } from "@/lib/vitrine/lista";

// Largura de cada foto na grade: 2 colunas no celular, 3 no resto.
const TAMANHOS_FOTO = "(max-width: 767px) 50vw, (max-width: 1023px) 33vw, 275px";

// Cards na primeira tela do celular: as 2 primeiras linhas da grade de 2
// colunas cabem inteiras em 390x844 (medido no Chrome: a foto da 2ª linha
// termina em 764px). A foto deles carrega já (sem loading="lazy"), porque
// uma delas costuma ser o maior elemento da tela (LCP).
const CARDS_NA_PRIMEIRA_TELA = 4;

// Grade única da Lista, já na ordem de montarLista (destaques com selo
// primeiro, depois os outros). Sem subtítulo visível: o H2 existe só pra
// leitor de tela, pra hierarquia seguir H1 → H2 → H3 (nome do produto).
// - nenhum item: mensagem de categoria vazia com caminho para "Todos";
// - itens null: falha ao buscar no banco.
export function ListaProdutos({
  categoria,
  itens,
}: {
  categoria: CategoriaProduto | null;
  itens: ItemLista[] | null;
}) {
  if (itens === null) {
    return (
      <div className="lista-aviso">
        <Icon name="error" size={28} tone="accent" />
        <p>Não conseguimos carregar os produtos agora. Tente de novo em alguns instantes.</p>
      </div>
    );
  }

  if (itens.length === 0) {
    return (
      <div className="lista-aviso">
        <Icon name="search_off" size={28} tone="accent" />
        {categoria ? (
          <>
            <p>Ainda não temos produtos nesta categoria.</p>
            <TextLink href={ROTAS.lista} icon="arrow_forward">
              Ver todos os produtos
            </TextLink>
          </>
        ) : (
          <p>Ainda não temos produtos por aqui.</p>
        )}
      </div>
    );
  }

  return (
    <section aria-labelledby="lista-titulo-grade">
      <h2 id="lista-titulo-grade" className="site-visually-hidden">
        {categoria ?? "Todos os produtos"}
      </h2>
      <ul className="lista-grade" role="list">
        {itens.map(({ produto, maisPedido }, i) => (
          <li key={produto.id}>
            <CardProduto
              produto={produto}
              sizes={TAMANHOS_FOTO}
              maisPedido={maisPedido}
              prioridade={i < CARDS_NA_PRIMEIRA_TELA}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
