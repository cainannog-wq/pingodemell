import { CATEGORIA_VALUES, type CategoriaProduto } from "@/lib/produtos/types";
import { categoriaParaParametro } from "@/lib/site/rotas";
import type { ProdutoVitrine } from "./mais-pedidos";

// Regra da página Lista de produtos (/produtos), numa função pura coberta
// por teste automatizado — a consulta ao banco só traz os dados.

// Ordem dos grupos em "Todos" (e dos botões do filtro): as 4 categorias do
// CMS, nesta ordem. Produto sem categoria vai para "Outros", no fim.
export const ORDEM_CATEGORIAS: readonly CategoriaProduto[] = CATEGORIA_VALUES;
export const TITULO_SEM_CATEGORIA = "Outros";

export type GrupoLista = {
  // Categoria do grupo; null = produtos sem categoria ("Outros").
  categoria: CategoriaProduto | null;
  // Subtítulo visível do grupo. Só existe em "Todos"; na visão filtrada é
  // null (a página não mostra subtítulo).
  titulo: string | null;
  produtos: ProdutoVitrine[];
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

// Monta o que a Lista mostra:
// - só produto ativo, em qualquer visão (mesmo que o banco devolva
//   inativo — ex.: admin logado navegando no site, cuja sessão lê todos);
// - "Todos" (categoria null): grupos Bolos, Doces, Salgados, Bebidas e
//   "Outros" (sem categoria) no fim, cada um com subtítulo; grupo sem
//   produto ativo não aparece;
// - categoria escolhida: um único grupo, sem subtítulo; "Outros" nunca
//   aparece aqui;
// - dentro de cada grupo, nome em ordem alfabética. atualizado_em não
//   entra na ordem: editar um produto não muda a posição dele.
// Retorna [] quando não há nada a mostrar (a página mostra a mensagem de
// categoria vazia).
export function montarLista(produtos: ProdutoVitrine[], categoria: CategoriaProduto | null): GrupoLista[] {
  const ativos = produtos.filter((p) => p.ativo === true);

  if (categoria) {
    const daCategoria = ativos.filter((p) => p.Categoria === categoria).sort(compararPorNome);
    return daCategoria.length > 0 ? [{ categoria, titulo: null, produtos: daCategoria }] : [];
  }

  const grupos: GrupoLista[] = ORDEM_CATEGORIAS.map((c) => ({
    categoria: c,
    titulo: c,
    produtos: ativos.filter((p) => p.Categoria === c).sort(compararPorNome),
  }));
  grupos.push({
    categoria: null,
    titulo: TITULO_SEM_CATEGORIA,
    // Tudo que não é uma das 4 categorias conhecidas (na prática, null).
    produtos: ativos.filter((p) => !p.Categoria || !ORDEM_CATEGORIAS.includes(p.Categoria)).sort(compararPorNome),
  });

  return grupos.filter((g) => g.produtos.length > 0);
}
