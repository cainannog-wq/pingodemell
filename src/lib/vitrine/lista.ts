import type { CategoriaProduto } from "@/lib/produtos/types";
import { categoriaParaParametro } from "@/lib/site/rotas";
import { lerBusca, nomeCasaComBusca, palavrasDaBusca } from "./busca";
import { ehMaisPedido, type ProdutoVitrine } from "./mais-pedidos";

// Regra da página Lista de produtos (/produtos), em funções puras cobertas
// por teste automatizado (lista.test.ts). A consulta ao banco só traz os
// dados: a lista inteira, do cache da vitrine; filtro, busca, ordenação e
// corte de página são feitos aqui (PR lista/busca-ordem-paginacao).

// Categorias da Lista, na ordem dos botões do filtro e da ordem
// "Recomendados" em "Todos". Adicionais e Bebidas ficam FORA da Lista
// inteira, inclusive de "Todos" (decisão do Cainan, fase 14b): o produto
// continua abrindo pela interna, mas não aparece aqui. A ordem do admin
// e do sitemap continua a da lista única (produtos/categorias.ts).
export const CATEGORIAS_DA_LISTA = ["Bolos", "Doces", "Salgados", "Kits", "Bento Cake"] as const satisfies readonly CategoriaProduto[];

export function categoriaEstaNaLista(categoria: CategoriaProduto | null | undefined): boolean {
  return (CATEGORIAS_DA_LISTA as readonly (CategoriaProduto | null | undefined)[]).includes(categoria);
}

// Produto que a Lista mostra: ativo e de uma categoria da Lista. Produto
// sem categoria (o banco não aceita mais desde 03/10/2026) ou com valor que
// o código não conhece também fica fora.
function entraNaLista(p: ProdutoVitrine): boolean {
  return p.ativo === true && categoriaEstaNaLista(p.Categoria);
}

export const ORDENS = [
  { valor: "recomendados", rotulo: "Recomendados" },
  { valor: "mais-pedidos", rotulo: "Mais pedidos" },
  { valor: "a-z", rotulo: "Nome A a Z" },
  { valor: "z-a", rotulo: "Nome Z a A" },
] as const;
export type OrdemLista = (typeof ORDENS)[number]["valor"];
export const ORDEM_PADRAO: OrdemLista = "recomendados";

export const POR_PAGINA = 24;

export type ItemLista = {
  produto: ProdutoVitrine;
  // true = produto em destaque, com selo "Mais pedido" (em qualquer ordem).
  maisPedido: boolean;
};

// Lê o `?categoria=` da URL (formato de ROTAS.listaPorCategoria: o
// `parametro` da lista única, sem diferenciar maiúscula). Qualquer valor que
// não seja o de uma categoria da Lista (vazio, repetido, inventado,
// adicionais, bebidas) vale como "Todos" (null), sem erro.
export function categoriaDoParametro(valor: string | string[] | undefined): CategoriaProduto | null {
  const texto = Array.isArray(valor) ? valor[0] : valor;
  if (!texto) return null;
  const normalizado = texto.trim().toLowerCase();
  return CATEGORIAS_DA_LISTA.find((c) => categoriaParaParametro(c) === normalizado) ?? null;
}

// `?ordem=`: valor desconhecido vale como Recomendados. "Mais pedidos" só
// existe em "Todos" (e só se houver destaque: isso depende dos dados e é
// decidido em montarLista).
export function ordemDoParametro(valor: string | string[] | undefined): OrdemLista {
  const texto = (Array.isArray(valor) ? valor[0] : valor)?.trim().toLowerCase();
  return ORDENS.find((o) => o.valor === texto)?.valor ?? ORDEM_PADRAO;
}

// `?pagina=`: só número inteiro positivo, escrito só com dígitos. Qualquer
// outra coisa (vazio, 0, negativo, "2,5", "abc") vale como página 1. A
// página maior que o total é corrigida em montarLista (vai para a última).
export function paginaDoParametro(valor: string | string[] | undefined): number {
  const texto = (Array.isArray(valor) ? valor[0] : valor)?.trim();
  if (!texto || !/^\d{1,6}$/.test(texto)) return 1;
  const n = Number(texto);
  return n >= 1 ? n : 1;
}

export type ParametrosLista = {
  categoria: CategoriaProduto | null;
  busca: string;
  ordem: OrdemLista;
  pagina: number;
};

export function lerParametrosDaLista(
  searchParams: Record<string, string | string[] | undefined>
): ParametrosLista {
  return {
    categoria: categoriaDoParametro(searchParams.categoria),
    busca: lerBusca(searchParams.busca),
    ordem: ordemDoParametro(searchParams.ordem),
    pagina: paginaDoParametro(searchParams.pagina),
  };
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

// Destaques primeiro, depois A a Z. atualizado_em não entra: editar um
// produto não muda a posição dele; só ligar ou desligar o destaque muda.
function destaquesPrimeiro(a: ProdutoVitrine, b: ProdutoVitrine): number {
  const porDestaque = Number(ehMaisPedido(b)) - Number(ehMaisPedido(a));
  return porDestaque !== 0 ? porDestaque : compararPorNome(a, b);
}

function posicaoDaCategoria(p: ProdutoVitrine): number {
  return (CATEGORIAS_DA_LISTA as readonly (CategoriaProduto | null)[]).indexOf(p.Categoria);
}

function comparador(ordem: OrdemLista, categoria: CategoriaProduto | null) {
  switch (ordem) {
    case "a-z":
      return compararPorNome;
    case "z-a":
      return (a: ProdutoVitrine, b: ProdutoVitrine) => compararPorNome(b, a);
    case "mais-pedidos":
      return destaquesPrimeiro;
    case "recomendados":
      // Numa categoria: destaques primeiro, depois A a Z. Em "Todos": por
      // categoria (Bolos, Doces, Salgados, Kits, Bento Cake) e, dentro de
      // cada uma, destaques primeiro e depois A a Z.
      if (categoria) return destaquesPrimeiro;
      return (a: ProdutoVitrine, b: ProdutoVitrine) => posicaoDaCategoria(a) - posicaoDaCategoria(b) || destaquesPrimeiro(a, b);
  }
}

export type ResultadoLista = {
  // Só os itens da página atual (até POR_PAGINA).
  itens: ItemLista[];
  // Total de produtos depois de categoria e busca, em todas as páginas.
  total: number;
  pagina: number;
  totalPaginas: number;
  // Ordem efetivamente aplicada (Mais pedidos que não vale vira Recomendados).
  ordem: OrdemLista;
  // A opção "Mais pedidos" aparece no seletor: só em "Todos" e só se
  // houver ao menos um destaque na Lista inteira (sem olhar a busca, para a
  // opção não sumir e voltar enquanto a cliente busca).
  maisPedidosDisponivel: boolean;
  // A categoria escolhida (ou "Todos") tem algum produto, sem a busca:
  // separa "categoria vazia" de "busca sem resultado".
  temProdutosSemBusca: boolean;
};

// Monta a página da Lista:
// - só produto ativo e de categoria da Lista, em qualquer visão (mesmo que
//   o banco devolva inativo);
// - categoria escolhida: só ela; "Todos" (null): as 5 da Lista;
// - busca pelo nome (busca.ts);
// - ordem pedida (Mais pedidos que não vale vira Recomendados);
// - página: maior que o total vai para a última; sem nenhum item, 1.
export function montarLista(produtos: ProdutoVitrine[], parametros: ParametrosLista): ResultadoLista {
  const { categoria, busca, pagina: paginaPedida } = parametros;
  const daLista = produtos.filter(entraNaLista);

  const maisPedidosDisponivel = categoria === null && daLista.some(ehMaisPedido);
  const ordem = parametros.ordem === "mais-pedidos" && !maisPedidosDisponivel ? ORDEM_PADRAO : parametros.ordem;

  const daCategoria = categoria === null ? daLista : daLista.filter((p) => p.Categoria === categoria);
  const palavras = palavrasDaBusca(busca);
  const encontrados = daCategoria.filter((p) => nomeCasaComBusca(p.nome, palavras)).sort(comparador(ordem, categoria));

  const total = encontrados.length;
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const pagina = Math.min(Math.max(1, paginaPedida), totalPaginas);
  const inicio = (pagina - 1) * POR_PAGINA;

  return {
    itens: encontrados.slice(inicio, inicio + POR_PAGINA).map((produto) => ({ produto, maisPedido: ehMaisPedido(produto) })),
    total,
    pagina,
    totalPaginas,
    ordem,
    maisPedidosDisponivel,
    temProdutosSemBusca: daCategoria.length > 0,
  };
}

// Números da paginação: sempre a primeira, a última, a atual e as vizinhas
// dela; o resto vira "…". Cabe numa tela de 375px (no máximo 7 posições).
export function paginasVisiveis(atual: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const mostrar = new Set([1, total, atual - 1, atual, atual + 1]);
  if (atual <= 3) [2, 3, 4].forEach((n) => mostrar.add(n));
  if (atual >= total - 2) [total - 3, total - 2, total - 1].forEach((n) => mostrar.add(n));
  const numeros = [...mostrar].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const saida: (number | "…")[] = [];
  numeros.forEach((n, i) => {
    if (i > 0 && n - numeros[i - 1] > 1) saida.push("…");
    saida.push(n);
  });
  return saida;
}
