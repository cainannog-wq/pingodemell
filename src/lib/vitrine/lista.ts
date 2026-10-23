import { categoriaCanonica } from "@/lib/produtos/categorias";
import type { CategoriaProduto } from "@/lib/produtos/types";
import { categoriaParaParametro, urlDaLista } from "@/lib/site/rotas";
import { ordenarSubcategorias } from "@/lib/subcategorias/regras";
import type { Subcategoria } from "@/lib/subcategorias/types";
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
export const CATEGORIAS_DA_LISTA = ["Bolos", "Doces", "Salgados", "Kit Festa", "Bento Cake"] as const satisfies readonly CategoriaProduto[];

// Aceita o nome antigo "Kits" como "Kit Festa" (ver categoriaCanonica).
export function categoriaEstaNaLista(categoria: string | null | undefined): boolean {
  const canonica = categoriaCanonica(categoria);
  return canonica !== null && (CATEGORIAS_DA_LISTA as readonly CategoriaProduto[]).includes(canonica);
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
// Parâmetros antigos da URL que ainda chegam de links de fora: o endereço
// de uma categoria renomeada. A Lista redireciona (308) para o parâmetro
// atual; nenhum link nosso usa estes valores.
const PARAMETROS_ANTIGOS: Readonly<Record<string, CategoriaProduto>> = { kits: "Kit Festa" };

export function categoriaDoParametroAntigo(valor: string | string[] | undefined): CategoriaProduto | null {
  const texto = Array.isArray(valor) ? valor[0] : valor;
  if (!texto) return null;
  return PARAMETROS_ANTIGOS[texto.trim().toLowerCase()] ?? null;
}

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

// `?subcategoria=`: guardado CRU (slug em minúsculas, sem espaço nas pontas,
// ou null). Quem valida é montarLista, que conhece a categoria e as
// subcategorias; assim o 308 de `?categoria=kits` não perde o valor (a
// categoria ainda é null naquele momento). Passa de 80 caracteres = vazio.
export const SUBCATEGORIA_SLUG_MAX = 80;

export function subcategoriaDoParametro(valor: string | string[] | undefined): string | null {
  const texto = (Array.isArray(valor) ? valor[0] : valor)?.trim().toLowerCase();
  if (!texto || texto.length > SUBCATEGORIA_SLUG_MAX) return null;
  return texto;
}

export type ParametrosLista = {
  categoria: CategoriaProduto | null;
  // Slug cru; só vale junto de uma categoria e se for de uma subcategoria
  // ativa dela com produto na Lista (ver montarLista).
  // Ausente = null (chamadas que não filtram por subcategoria).
  subcategoria?: string | null;
  busca: string;
  ordem: OrdemLista;
  pagina: number;
};

export function lerParametrosDaLista(
  searchParams: Record<string, string | string[] | undefined>
): ParametrosLista {
  return {
    categoria: categoriaDoParametro(searchParams.categoria),
    subcategoria: subcategoriaDoParametro(searchParams.subcategoria),
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
  return (CATEGORIAS_DA_LISTA as readonly (CategoriaProduto | null)[]).indexOf(categoriaCanonica(p.Categoria));
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
      // categoria (Bolos, Doces, Salgados, Kit Festa, Bento Cake) e, dentro de
      // cada uma, destaques primeiro e depois A a Z.
      if (categoria) return destaquesPrimeiro;
      return (a: ProdutoVitrine, b: ProdutoVitrine) => posicaoDaCategoria(a) - posicaoDaCategoria(b) || destaquesPrimeiro(a, b);
  }
}

// Botão do filtro por subcategoria.
export type ChipSubcategoria = { id: string; nome: string; slug: string };

// Chips da categoria: subcategorias ATIVAS da categoria com pelo menos um
// produto entre `daCategoria` (já filtrado por entraNaLista e categoria,
// antes da busca, para os chips não sumirem enquanto a cliente busca), na
// ordem `ordem` e depois nome. A categoria da subcategoria é comparada pela
// forma canônica nos dois lados ("Kits" = "Kit Festa").
export function chipsDaCategoria(
  categoria: CategoriaProduto | null,
  daCategoria: readonly ProdutoVitrine[],
  subcategorias: readonly Subcategoria[]
): ChipSubcategoria[] {
  if (categoria === null) return [];
  const comProduto = new Set(daCategoria.map((p) => p.subcategoria_id).filter((id): id is string => !!id));
  const ordenadas = ordenarSubcategorias(
    subcategorias.filter(
      (s) => s.ativo === true && categoriaCanonica(s.categoria) === categoria && comProduto.has(s.id)
    )
  ).map(({ id, nome, slug }) => ({ id, nome, slug }));
  // Kit Festa: "Por pessoa" vem sempre primeiro, qualquer que seja a ordem
  // cadastrada no admin (decisão de 21/10/2026). As demais seguem a ordem.
  if (categoria === "Kit Festa") {
    const i = ordenadas.findIndex((c) => c.slug === SUBCATEGORIA_PRIMEIRA_KIT_FESTA);
    if (i > 0) ordenadas.unshift(...ordenadas.splice(i, 1));
  }
  return ordenadas;
}

// Valor de `?subcategoria=` que pede "Todos" de uma categoria que tem filtro.
// Sem o parâmetro, a categoria abre na primeira subcategoria (decisão do Cainan,
// 23/10/2026); "Todos" precisa de um endereço próprio para continuar alcançável.
export const SUBCATEGORIA_TODOS = "todos";

// Slug da subcategoria que abre a lista do Kit Festa.
export const SUBCATEGORIA_PRIMEIRA_KIT_FESTA = "por-pessoa";

// Endereço de um chip (ou de "Todas", com slug null): mantém categoria, busca
// e ordem, troca a subcategoria e nunca leva a página (trocar volta à 1).
export function urlDaSubcategoria(
  parametros: Pick<ParametrosLista, "categoria" | "busca" | "ordem">,
  slug: string | null
): string {
  const { categoria, busca, ordem } = parametros;
  return urlDaLista({ categoria, subcategoria: slug, busca, ordem });
}

// Uma opção do filtro ("Todos" e uma por subcategoria), com o endereço pronto.
// Os dois desenhos (acordeão do desktop e chips do celular) usam esta lista.
export type OpcaoSubcategoria = { chave: string; nome: string; href: string; atual: boolean };

export function opcoesDeSubcategoria(
  parametros: Pick<ParametrosLista, "categoria" | "busca" | "ordem">,
  chips: readonly ChipSubcategoria[],
  ativa: string | null
): OpcaoSubcategoria[] {
  // "Todos" é sempre a última opção, em todas as categorias.
  return [...chips.map((c) => ({ chave: c.id, nome: c.nome, slug: c.slug })), { chave: "todos", nome: "Todos", slug: null }].map((o) => ({
    chave: o.chave,
    nome: o.nome,
    href: urlDaSubcategoria(parametros, o.slug === null && chips.length > 0 ? SUBCATEGORIA_TODOS : o.slug),
    atual: o.slug === ativa,
  }));
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
  // Chips do filtro por subcategoria (vazio = sem filtro na tela) e o slug
  // da subcategoria efetivamente aplicada (null = "Todas": sem categoria,
  // slug inválido ou sem chips).
  chips: ChipSubcategoria[];
  subcategoriaAtiva: string | null;
  // O que a URL leva para manter a escolha: o slug, ou "todos" quando a
  // categoria tem filtro e a cliente está em "Todos" (sem isso a página
  // voltaria à primeira subcategoria). Nulo sem filtro.
  subcategoriaNaUrl: string | null;
  // Categorias da Lista que têm filtro (pelo menos um chip), para o acordeão
  // do desktop mostrar a seta em cada uma, não só na escolhida.
  categoriasComFiltro: CategoriaProduto[];
  // A categoria escolhida (ou "Todos") tem algum produto, sem a busca:
  // separa "categoria vazia" de "busca sem resultado".
  temProdutosSemBusca: boolean;
};

// Monta a página da Lista:
// - só produto ativo e de categoria da Lista, em qualquer visão (mesmo que
//   o banco devolva inativo);
// - categoria escolhida: só ela; "Todos" (null): as 5 da Lista;
// - subcategoria (só com categoria): vale o slug de um chip da categoria;
//   qualquer outro vale como "Todas", sem erro;
// - busca pelo nome (busca.ts);
// - ordem pedida (Mais pedidos que não vale vira Recomendados);
// - página: maior que o total vai para a última; sem nenhum item, 1.
export function montarLista(
  produtos: ProdutoVitrine[],
  parametros: ParametrosLista,
  subcategorias: readonly Subcategoria[] = []
): ResultadoLista {
  const { categoria, busca, pagina: paginaPedida } = parametros;
  const daLista = produtos.filter(entraNaLista);

  const maisPedidosDisponivel = categoria === null && daLista.some(ehMaisPedido);
  const ordem = parametros.ordem === "mais-pedidos" && !maisPedidosDisponivel ? ORDEM_PADRAO : parametros.ordem;

  const daCategoria = categoria === null ? daLista : daLista.filter((p) => categoriaCanonica(p.Categoria) === categoria);
  const chips = chipsDaCategoria(categoria, daCategoria, subcategorias);
  // Categoria com filtro sem `?subcategoria=` (ou com valor que não vale)
  // abre na primeira subcategoria; "todos" mostra a categoria inteira.
  const escolhida =
    parametros.subcategoria === SUBCATEGORIA_TODOS
      ? null
      : (chips.find((c) => c.slug === parametros.subcategoria) ?? chips[0] ?? null);
  const daSubcategoria = escolhida ? daCategoria.filter((p) => p.subcategoria_id === escolhida.id) : daCategoria;
  const palavras = palavrasDaBusca(busca);
  const encontrados = daSubcategoria.filter((p) => nomeCasaComBusca(p.nome, palavras)).sort(comparador(ordem, categoria));

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
    chips,
    subcategoriaAtiva: escolhida?.slug ?? null,
    subcategoriaNaUrl: escolhida?.slug ?? (chips.length > 0 ? SUBCATEGORIA_TODOS : null),
    categoriasComFiltro: CATEGORIAS_DA_LISTA.filter(
      (c) => chipsDaCategoria(c, daLista.filter((p) => categoriaCanonica(p.Categoria) === c), subcategorias).length > 0
    ),
    temProdutosSemBusca: daSubcategoria.length > 0,
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
