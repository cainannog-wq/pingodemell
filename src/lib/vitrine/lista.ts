import { CATEGORIA_VALUES, type CategoriaProduto } from "@/lib/produtos/types";
import { categoriaParaParametro } from "@/lib/site/rotas";
import { ehMaisPedido, type ProdutoVitrine } from "./mais-pedidos";

// Regra da página Lista de produtos (/produtos), numa função pura coberta
// por teste automatizado — a consulta ao banco só traz os dados.

// Categorias do filtro, na ordem dos botões.
export const ORDEM_CATEGORIAS: readonly CategoriaProduto[] = CATEGORIA_VALUES;

export type ItemLista = {
  produto: ProdutoVitrine;
  // true = bloco de destaques do topo, com selo "Mais pedido".
  maisPedido: boolean;
};

// Lê o `?categoria=` da URL (formato de ROTAS.listaPorCategoria: categoria
// em minúsculas). Qualquer valor que não seja uma das 4 categorias — vazio,
// repetido, inventado — vale como "Todos" (null), sem erro.
export function categoriaDoParametro(valor: string | string[] | undefined): CategoriaProduto | null {
  const texto = Array.isArray(valor) ? valor[0] : valor;
  if (!texto) return null;
  const normalizado = texto.trim().toLowerCase();
  return ORDEM_CATEGORIAS.find((c) => categoriaParaParametro(c) === normalizado) ?? null;
}

// Ordem alfabética como um leitor brasileiro espera: acento e maiúscula não
// separam ("Éclair" fica junto dos E, "açaí" junto dos A). Números dentro
// do nome em ordem numérica ("2L" antes de "10L"). Nomes que só diferem em
// acento/maiúscula desempatam pelo texto exato, pra ordem nunca oscilar.
const COLLATOR = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

export function compararPorNome(a: Pick<ProdutoVitrine, "nome">, b: Pick<ProdutoVitrine, "nome">): number {
  const porNome = COLLATOR.compare(a.nome, b.nome);
  if (porNome !== 0) return porNome;
  return a.nome < b.nome ? -1 : a.nome > b.nome ? 1 : 0;
}

// Monta a grade da Lista (única, sem subtítulos):
// - só produto ativo, em qualquer visão (mesmo que o banco devolva
//   inativo — ex.: admin logado navegando no site, cuja sessão lê todos);
// - categoria escolhida: só ela; "Todos" (null): todas, inclusive sem
//   categoria;
// - primeiro os destaques (ehMaisPedido), depois todos os outros;
//   nos dois blocos, nome em ordem alfabética. atualizado_em não entra na
//   ordem: editar um produto não muda a posição dele; só ligar ou desligar
//   o destaque muda.
// Retorna [] quando não há nada a mostrar (a página mostra a mensagem de
// categoria vazia).
export function montarLista(produtos: ProdutoVitrine[], categoria: CategoriaProduto | null): ItemLista[] {
  const visiveis = produtos
    .filter((p) => p.ativo === true)
    .filter((p) => categoria === null || p.Categoria === categoria)
    .sort(compararPorNome);

  const destaques = visiveis.filter(ehMaisPedido);
  const demais = visiveis.filter((p) => !ehMaisPedido(p));

  return [
    ...destaques.map((produto) => ({ produto, maisPedido: true })),
    ...demais.map((produto) => ({ produto, maisPedido: false })),
  ];
}
