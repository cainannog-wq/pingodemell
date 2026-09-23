import { Icon, TextLink } from "@/components/ds";
import { CardProduto } from "@/components/site/CardProduto";
import type { CategoriaProduto } from "@/lib/produtos/types";
import { ROTAS } from "@/lib/site/rotas";
import type { GrupoLista } from "@/lib/vitrine/lista";

// Largura de cada foto na grade: 2 colunas no celular, 3 no resto.
const TAMANHOS_FOTO = "(max-width: 767px) 50vw, (max-width: 1023px) 33vw, 275px";

// Grade da Lista, já com os grupos montados por montarLista.
// - "Todos": um subtítulo (H2) por grupo;
// - categoria escolhida: sem subtítulo visível — o H2 existe só pra leitor
//   de tela, pra hierarquia continuar H1 → H2 → H3 (nome do produto);
// - nenhum grupo: mensagem de categoria vazia com caminho para "Todos";
// - grupos null: falha ao buscar no banco.
export function ListaProdutos({
  categoria,
  grupos,
}: {
  categoria: CategoriaProduto | null;
  grupos: GrupoLista[] | null;
}) {
  if (grupos === null) {
    return (
      <div className="lista-aviso">
        <Icon name="error" size={28} tone="accent" />
        <p>Não conseguimos carregar os produtos agora. Tente de novo em alguns instantes.</p>
      </div>
    );
  }

  if (grupos.length === 0) {
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
    <div className="lista-grupos">
      {grupos.map((grupo) => {
        const tituloId = `lista-grupo-${grupo.categoria?.toLowerCase() ?? "outros"}`;
        return (
          <section key={tituloId} aria-labelledby={tituloId}>
            {grupo.titulo ? (
              <h2 id={tituloId} className="lista-grupo-titulo">
                {grupo.titulo}
              </h2>
            ) : (
              <h2 id={tituloId} className="site-visually-hidden">
                {categoria}
              </h2>
            )}
            <ul className="lista-grade" role="list">
              {grupo.produtos.map((produto) => (
                <li key={produto.id}>
                  <CardProduto produto={produto} sizes={TAMANHOS_FOTO} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
