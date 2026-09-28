import type { ProdutoVitrine } from "./mais-pedidos";

// Produto tipo Cento na vitrine: sabores disponíveis e a distribuição das
// unidades entre eles. Funções puras cobertas por teste; a consulta ao
// banco fica em buscar.ts.
//
// Regras:
// - conta em número de centos (1, 2, 3...), sem pedido_minimo nem step;
// - cada cento vale 100 unidades fixas; o total (100 × centos) é
//   distribuído numa combinação só entre os sabores, em passos de 5, e a
//   soma tem que bater exatamente com o total;
// - sabor é outro produto do catálogo; só conta o que está ativo;
// - 1 sabor ativo: o total cai inteiro nele, sem distribuição;
// - 0 sabor ativo: o Cento fica indisponível, como produto inativo (some da
//   Home e da Lista, e a interna cai na 404). Sem estado novo no banco.

export const UNIDADES_POR_CENTO = 100;
export const PASSO_SABOR = 5;
// Teto de segurança do seletor. Mais que isso é conversa no WhatsApp.
export const MAX_CENTOS = 50;

// Consulta dos sabores: a linha de produto_cento_itens com o produto do
// sabor embutido pela chave estrangeira do subitem. A leitura de
// produto_cento_itens é pública (inclusive a linha de sabor inativo); quem
// esconde o sabor inativo é a RLS de produtos, e só para o anônimo (o
// embutido volta null). O admin logado recebe o inativo com ativo = false:
// por isso o filtro de ativo fica aqui, no código.
export const CAMPOS_SABOR =
  "cento_nome, subitem_nome, ordem, sabor:produtos!produto_cento_itens_subitem_nome_fkey(nome, ativo)";

export type LinhaSabor = {
  cento_nome: string;
  subitem_nome: string;
  ordem: number;
  sabor: { nome: string; ativo: boolean } | null;
};

// Sabores ativos de um Cento, na ordem do cadastro, sem repetir.
export function saboresAtivos(linhas: LinhaSabor[], centoNome?: string): string[] {
  const nomes: string[] = [];
  for (const linha of [...linhas].sort((a, b) => a.ordem - b.ordem)) {
    if (centoNome !== undefined && linha.cento_nome !== centoNome) continue;
    if (linha.sabor?.ativo !== true) continue;
    if (!nomes.includes(linha.subitem_nome)) nomes.push(linha.subitem_nome);
  }
  return nomes;
}

// Nomes dos Centos que têm ao menos um sabor ativo.
export function centosComSabor(linhas: LinhaSabor[]): Set<string> {
  return new Set(linhas.filter((l) => l.sabor?.ativo === true).map((l) => l.cento_nome));
}

// Tira da vitrine o Cento sem sabor ativo (igual a produto inativo).
export function semCentoIndisponivel<T extends Pick<ProdutoVitrine, "tipo" | "nome">>(
  produtos: T[],
  comSabor: Set<string>
): T[] {
  return produtos.filter((p) => p.tipo !== "cento" || comSabor.has(p.nome));
}

export function totalDoCento(centos: number): number {
  return centos * UNIDADES_POR_CENTO;
}

export function centosValidos(centos: number): boolean {
  return Number.isInteger(centos) && centos >= 1 && centos <= MAX_CENTOS;
}

export function passoCentos(atual: number, direcao: 1 | -1): number {
  const base = centosValidos(atual) ? atual : 1;
  return Math.min(MAX_CENTOS, Math.max(1, base + direcao));
}

// Quantidade de cada sabor, pelo nome do sabor.
export type Distribuicao = Record<string, number>;

// Começo: com 1 sabor, o total inteiro nele; com 2 ou mais, tudo zerado
// (a cliente escolhe).
export function distribuicaoInicial(sabores: string[], centos: number): Distribuicao {
  if (sabores.length === 1) return { [sabores[0]]: totalDoCento(centos) };
  return Object.fromEntries(sabores.map((s) => [s, 0]));
}

export function somaDistribuicao(distribuicao: Distribuicao): number {
  return Object.values(distribuicao).reduce((soma, n) => soma + n, 0);
}

export type SituacaoDistribuicao = {
  soma: number;
  total: number;
  // Quanto falta para fechar o total (0 quando fechou ou passou).
  falta: number;
  // Quanto passou do total (só acontece ao diminuir os centos depois de
  // distribuir).
  sobra: number;
  completa: boolean;
};

export function situacaoDistribuicao(distribuicao: Distribuicao, centos: number): SituacaoDistribuicao {
  const soma = somaDistribuicao(distribuicao);
  const total = totalDoCento(centos);
  return {
    soma,
    total,
    falta: Math.max(0, total - soma),
    sobra: Math.max(0, soma - total),
    completa: soma === total,
  };
}

// + e − de um sabor: 5 por clique, nunca abaixo de 0 e nunca acima do que
// falta para o total (o + trava quando a soma chega ao total). Sabor fora da
// lista não muda nada.
export function podeAumentar(distribuicao: Distribuicao, sabor: string, centos: number): boolean {
  return sabor in distribuicao && somaDistribuicao(distribuicao) + PASSO_SABOR <= totalDoCento(centos);
}

export function alterarSabor(distribuicao: Distribuicao, sabor: string, direcao: 1 | -1, centos: number): Distribuicao {
  if (!(sabor in distribuicao)) return distribuicao;
  if (direcao === 1 && !podeAumentar(distribuicao, sabor, centos)) return distribuicao;
  const atual = distribuicao[sabor];
  const novo = Math.max(0, atual + direcao * PASSO_SABOR);
  if (novo === atual) return distribuicao;
  return { ...distribuicao, [sabor]: novo };
}

// Composição que pode ir para o carrinho: centos válidos, só sabores da
// lista (todos presentes), cada quantidade inteira, >= 0 e em passos de 5,
// e a soma exatamente igual a 100 × centos.
export function composicaoValida(distribuicao: Distribuicao, sabores: string[], centos: number): boolean {
  if (!centosValidos(centos) || sabores.length === 0) return false;
  const chaves = Object.keys(distribuicao);
  if (chaves.length !== sabores.length || !sabores.every((s) => s in distribuicao)) return false;
  const quantidadesOk = Object.values(distribuicao).every((n) => Number.isInteger(n) && n >= 0 && n % PASSO_SABOR === 0);
  return quantidadesOk && somaDistribuicao(distribuicao) === totalDoCento(centos);
}
