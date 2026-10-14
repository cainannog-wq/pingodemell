import { Icon, TextLink } from "@/components/ds";
import { CardProduto } from "@/components/site/CardProduto";
import { ROTAS, urlDaLista } from "@/lib/site/rotas";
import { POR_PAGINA, type ParametrosLista, type ResultadoLista } from "@/lib/vitrine/lista";

// Largura de cada foto na grade: 2 colunas no celular, 3 no resto.
const TAMANHOS_FOTO = "(max-width: 767px) 50vw, (max-width: 1023px) 33vw, 275px";

// Cards na primeira tela do celular: as 2 primeiras linhas da grade de 2
// colunas cabem inteiras em 390x844 (medido no Chrome: a foto da 2ª linha
// termina em 764px). A foto deles carrega já (sem loading="lazy"), porque
// uma delas costuma ser o maior elemento da tela (LCP).
const CARDS_NA_PRIMEIRA_TELA = 4;

const plural = (n: number) => (n === 1 ? "1 produto" : `${n} produtos`);

// Grade da página atual, já na ordem de montarLista. Sem subtítulo visível:
// o H2 existe só pra leitor de tela, pra hierarquia seguir H1 → H2 → H3
// (nome do produto).
// - resultado null: falha ao buscar no banco;
// - busca sem resultado: mensagem com o texto buscado e "Limpar busca";
// - categoria sem produto: mensagem com caminho para "Todos".
export function ListaProdutos({
  parametros,
  resultado,
}: {
  parametros: ParametrosLista;
  resultado: ResultadoLista | null;
}) {
  const { categoria, busca } = parametros;

  if (resultado === null) {
    return (
      <div className="lista-aviso">
        <Icon name="error" size={28} tone="accent" />
        <p>Não conseguimos carregar os produtos agora. Tente de novo em alguns instantes.</p>
      </div>
    );
  }

  const limparBusca = urlDaLista({ categoria, subcategoria: resultado.subcategoriaAtiva, ordem: resultado.ordem });

  if (resultado.total === 0) {
    if (busca && resultado.temProdutosSemBusca) {
      return (
        <div className="lista-aviso" role="status">
          <Icon name="search_off" size={28} tone="accent" />
          <p>
            Nenhum produto {categoria ? `em ${categoria} ` : ""}com “{busca}” no nome. Confira a escrita ou tente outra
            palavra.
          </p>
          <TextLink href={limparBusca} icon="close">
            Limpar busca
          </TextLink>
        </div>
      );
    }
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

  const inicio = (resultado.pagina - 1) * POR_PAGINA + 1;
  const fim = inicio + resultado.itens.length - 1;

  return (
    <section aria-labelledby="lista-titulo-grade">
      <h2 id="lista-titulo-grade" className="site-visually-hidden">
        {categoria ?? "Todos os produtos"}
      </h2>
      <div className="lista-resumo" role="status">
        <p>
          {busca ? `${plural(resultado.total)} com “${busca}”` : plural(resultado.total)}
          {resultado.totalPaginas > 1 ? `, mostrando ${inicio} a ${fim}` : ""}
        </p>
        {busca ? (
          <TextLink href={limparBusca} icon="close">
            Limpar busca
          </TextLink>
        ) : null}
      </div>
      <ul className="lista-grade" role="list">
        {resultado.itens.map(({ produto, maisPedido }, i) => (
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
