import { CATEGORIAS, categoriaCanonica, type CategoriaProduto } from "@/lib/produtos/categorias";
import type { SubcategoriaOpcao } from "./types";

// Regras puras das subcategorias (sem I/O).

type ComOrdem = { id: string; nome: string; ordem: number };

// Ordem de exibição: `ordem` e, no empate, o nome (o banco admite empate).
export function ordenarSubcategorias<T extends ComOrdem>(linhas: readonly T[]): T[] {
  return [...linhas].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR"));
}

// As 7 categorias da lista única, na ordem dela, cada uma com as suas
// subcategorias (inclusive as vazias).
export function agruparPorCategoria<T extends ComOrdem & { categoria: string }>(linhas: readonly T[]) {
  return CATEGORIAS.map((c) => ({
    categoria: c.valor as CategoriaProduto,
    rotulo: c.rotulo as string,
    itens: ordenarSubcategorias(linhas.filter((l) => l.categoria === c.valor)),
  }));
}

export type Direcao = "subir" | "descer";

// Reordenação: devolve só as linhas cujo `ordem` muda, renumerando a
// categoria inteira de 10 em 10 depois de mover a linha uma posição. Partindo
// de empate ou de números tortos, o resultado sai sem empate. Primeira
// subindo, última descendo, ou id desconhecido: null (nada a gravar).
export function planejarMovimento(
  linhas: readonly ComOrdem[],
  id: string,
  direcao: Direcao
): { id: string; ordem: number }[] | null {
  const fila = ordenarSubcategorias(linhas);
  const i = fila.findIndex((l) => l.id === id);
  if (i < 0) return null;
  const j = direcao === "subir" ? i - 1 : i + 1;
  if (j < 0 || j >= fila.length) return null;
  const nova = [...fila];
  [nova[i], nova[j]] = [nova[j], nova[i]];
  const mudancas: { id: string; ordem: number }[] = [];
  nova.forEach((linha, posicao) => {
    const ordem = (posicao + 1) * 10;
    if (linha.ordem !== ordem) mudancas.push({ id: linha.id, ordem });
  });
  return mudancas;
}

// Vínculo que o produto já tem (edição). Só conta quando a categoria
// escolhida é a categoria salva do produto.
export type VinculoAtual = { subcategoriaId: string | null | undefined; categoriaSalva: string | null | undefined };

function vinculoDaCategoria(categoria: string, vinculo: VinculoAtual | null | undefined): string | null {
  if (!vinculo?.subcategoriaId) return null;
  return categoriaCanonica(vinculo.categoriaSalva) === categoriaCanonica(categoria) ? vinculo.subcategoriaId : null;
}

// O seletor de subcategoria aparece quando a categoria escolhida tem ao menos
// uma subcategoria ativa, OU quando o produto já está ligado a uma
// subcategoria dessa mesma categoria (mesmo inativa: sem isso o vínculo
// ficaria preso, sem como ver nem desfazer).
export function temSubcategoriaParaEscolher(
  linhas: readonly Pick<SubcategoriaOpcao, "id" | "categoria" | "ativo">[],
  categoria: string | null | undefined,
  vinculo?: VinculoAtual | null
): boolean {
  const canonica = categoriaCanonica(categoria);
  if (!canonica) return false;
  const daCategoria = linhas.filter((l) => l.categoria === canonica);
  if (daCategoria.some((l) => l.ativo)) return true;
  const atual = vinculoDaCategoria(canonica, vinculo);
  return atual !== null && daCategoria.some((l) => l.id === atual);
}

export type OpcaoDoSeletor = { id: string; rotulo: string };

// Opções do seletor: só a categoria escolhida, só as ativas, mais a atual do
// produto mesmo inativa, marcada "(inativa)".
export function opcoesDoSeletor(
  linhas: readonly SubcategoriaOpcao[],
  categoria: string | null | undefined,
  vinculo?: VinculoAtual | null
): OpcaoDoSeletor[] {
  const canonica = categoriaCanonica(categoria);
  if (!canonica) return [];
  const atual = vinculoDaCategoria(canonica, vinculo);
  return ordenarSubcategorias(linhas.filter((l) => l.categoria === canonica && (l.ativo || l.id === atual))).map((l) => ({
    id: l.id,
    rotulo: l.ativo ? l.nome : `${l.nome} (inativa)`,
  }));
}

// Validação do servidor do valor enviado: `linhas` são as subcategorias da
// categoria escolhida. Devolve a mensagem de recusa, ou null se vale.
export function recusaDaSubcategoria(
  id: string,
  linhas: readonly Pick<SubcategoriaOpcao, "id" | "ativo">[],
  categoria: string,
  vinculo?: VinculoAtual | null
): string | null {
  const linha = linhas.find((l) => l.id === id);
  if (!linha) return "Essa subcategoria não pertence à categoria escolhida. Recarregue a página e escolha de novo.";
  if (!linha.ativo && vinculoDaCategoria(categoria, vinculo) !== id) {
    return "Essa subcategoria está desativada. Escolha outra ou deixe em “Sem subcategoria”.";
  }
  return null;
}
