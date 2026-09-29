import { formatoValido, kgValido, type FormatoBolo } from "@/lib/vitrine/bolo";
import { centosValidos, PASSO_SABOR, totalDoCento } from "@/lib/vitrine/cento";
import { MAX_QUANTIDADE } from "@/lib/vitrine/quantidade";

// Carrinho do site público: regras puras, cobertas por teste. O estado
// fica no navegador (localStorage, src/lib/carrinho/armazenamento.ts) e é
// lido pelo CarrinhoProvider. Nada aqui vale como verdade para o pedido:
// nome, preço e unidade de cada linha são só para exibir, e a página do
// carrinho e o servidor do checkout conferem tudo de novo no banco (produto
// ativo, preço atual, mínimo, step e composição do Cento).

export const VERSAO_CARRINHO = 1;
export const MAX_LINHAS = 50;
export const OBSERVACAO_MAX = 300;

type LinhaBase = {
  // Identificador da linha (não do produto): duas linhas do mesmo produto
  // com observações diferentes são linhas diferentes.
  id: string;
  produtoId: string;
  slug: string | null;
  // Só para exibir; o preço que vale sai do banco.
  nome: string;
  preco: number;
  // Observação da cliente para este item (opcional, texto livre). Vai com o
  // item para a mensagem do WhatsApp e para o registro do pedido; é
  // diferente das observações do pedido inteiro, no checkout.
  observacao: string | null;
};

export type LinhaAvulso = LinhaBase & {
  tipo: "normal";
  unidade_venda: string | null;
  // Na unidade de venda, inteira.
  quantidade: number;
};

export type LinhaCento = LinhaBase & {
  tipo: "cento";
  // Número de centos (1, 2, 3...).
  quantidade: number;
  // Uma combinação só para o total (100 × centos), na ordem dos sabores.
  sabores: { nome: string; quantidade: number }[];
};

// Recheio escolhido (Bolo e Bento Cake). O nome é só para exibir; o id
// aponta para public.recheios, que o servidor do checkout confere de novo
// (ativo, vale_bolo / vale_bento, preço atual).
export type RecheioEscolhido = { id: string; nome: string };

// Bolo: quantidade em kg (inteiro) e preco = R$/kg do recheio escolhido,
// então quantidade × preco é o preço do bolo (a mesma conta do pedido).
// O acréscimo de decoração é orçado à parte, nunca entra aqui.
export type LinhaBolo = LinhaBase & {
  tipo: "bolo";
  quantidade: number;
  recheio: RecheioEscolhido;
  formato: FormatoBolo;
};

// Bento Cake: quantidade de bentos, um recheio só para todos (informativo,
// sem efeito no preço), preco = preço fixo do produto-tema. O Smash Cake
// não tem linha própria: é um avulso.
export type LinhaBento = LinhaBase & {
  tipo: "bento";
  quantidade: number;
  recheio: RecheioEscolhido;
};

export type LinhaCarrinho = LinhaAvulso | LinhaCento | LinhaBolo | LinhaBento;
export type NovaLinha =
  | Omit<LinhaAvulso, "id">
  | Omit<LinhaCento, "id">
  | Omit<LinhaBolo, "id">
  | Omit<LinhaBento, "id">;

export function normalizarObservacao(texto: string | null | undefined): string | null {
  const limpo = (texto ?? "").trim().slice(0, OBSERVACAO_MAX);
  return limpo === "" ? null : limpo;
}

// Mesma combinação por cento, não o mesmo total: 1 cento 60/40 é igual a
// 2 centos 120/80.
function mesmaCombinacao(a: LinhaCento, b: Omit<LinhaCento, "id">): boolean {
  if (a.sabores.length !== b.sabores.length) return false;
  const porNome = new Map(a.sabores.map((s) => [s.nome, s.quantidade]));
  return b.sabores.every((s) => porNome.has(s.nome) && porNome.get(s.nome)! * b.quantidade === s.quantidade * a.quantidade);
}

// Junta com uma linha existente quando é o mesmo item:
// - avulso: mesmo produto e mesma observação (soma a quantidade; somar dois
//   múltiplos do step continua múltiplo, e continua acima do mínimo);
// - Cento: mesmo produto, mesma observação e a mesma combinação por cento
//   (soma centos e sabores);
// - Bento Cake: mesmo produto, mesmo recheio e mesma observação (soma as
//   quantidades);
// - Bolo: nunca junta. Dois bolos de 2 kg não são um de 4 kg: cada
//   "adicionar" é um bolo (uma linha).
// Senão, linha nova no fim. Passar do teto não junta (vira linha nova, e a
// página do carrinho acerta).
export function adicionarLinha(linhas: LinhaCarrinho[], nova: NovaLinha, novoId: () => string): LinhaCarrinho[] {
  const observacao = normalizarObservacao(nova.observacao);
  const alvo = { ...nova, observacao } as NovaLinha;

  const indice =
    alvo.tipo === "bolo"
      ? -1
      : linhas.findIndex((l) => {
          if (l.produtoId !== alvo.produtoId || l.tipo !== alvo.tipo || l.observacao !== observacao) return false;
          if (l.tipo === "normal") return l.quantidade + alvo.quantidade <= MAX_QUANTIDADE;
          if (l.tipo === "bento") {
            const bento = alvo as Omit<LinhaBento, "id">;
            return l.recheio.id === bento.recheio.id && l.quantidade + bento.quantidade <= MAX_QUANTIDADE;
          }
          const cento = alvo as Omit<LinhaCento, "id">;
          return mesmaCombinacao(l, cento) && centosValidos(l.quantidade + cento.quantidade);
        });

  if (indice === -1) {
    if (linhas.length >= MAX_LINHAS) return linhas;
    return [...linhas, { ...alvo, id: novoId() } as LinhaCarrinho];
  }

  return linhas.map((l, i) => {
    if (i !== indice) return l;
    if (l.tipo === "normal" || l.tipo === "bento") return { ...l, quantidade: l.quantidade + alvo.quantidade };
    if (l.tipo === "bolo") return l;
    const cento = alvo as Omit<LinhaCento, "id">;
    const somaPorNome = new Map(cento.sabores.map((s) => [s.nome, s.quantidade]));
    return {
      ...l,
      quantidade: l.quantidade + cento.quantidade,
      sabores: l.sabores.map((s) => ({ nome: s.nome, quantidade: s.quantidade + (somaPorNome.get(s.nome) ?? 0) })),
    };
  });
}

export function removerLinha(linhas: LinhaCarrinho[], id: string): LinhaCarrinho[] {
  return linhas.filter((l) => l.id !== id);
}

// Troca uma linha inteira (a página do carrinho monta a linha nova com as
// mesmas regras da interna). Linha inválida não entra.
export function alterarLinha(linhas: LinhaCarrinho[], id: string, nova: LinhaCarrinho): LinhaCarrinho[] {
  if (nova.id !== id || !linhaValida(nova)) return linhas;
  return linhas.map((l) => (l.id === id ? nova : l));
}

// Contador do cabeçalho: número de linhas (itens diferentes), não a soma
// das quantidades.
export function contarItens(linhas: LinhaCarrinho[]): number {
  return linhas.length;
}

// --- Leitura do que está salvo no navegador ---------------------------------
// O texto do localStorage pode ter sido mexido à mão, vir de uma versão
// antiga ou estar corrompido: cada linha é conferida e a inválida é
// descartada, sem quebrar a página.

function texto(v: unknown, max = 200): v is string {
  return typeof v === "string" && v.trim() !== "" && v.length <= max;
}

function inteiro(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
}

function recheioValido(v: unknown): v is RecheioEscolhido {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return texto(r.id) && texto(r.nome);
}

export function linhaValida(v: unknown): v is LinhaCarrinho {
  if (typeof v !== "object" || v === null) return false;
  const l = v as Record<string, unknown>;
  if (!texto(l.id) || !texto(l.produtoId) || !texto(l.nome)) return false;
  if (l.slug !== null && !texto(l.slug)) return false;
  if (typeof l.preco !== "number" || !Number.isFinite(l.preco) || l.preco < 0) return false;
  if (l.observacao !== null && !(typeof l.observacao === "string" && l.observacao.length <= OBSERVACAO_MAX)) return false;

  if (l.tipo === "normal") {
    if (l.unidade_venda !== null && !texto(l.unidade_venda, 20)) return false;
    return inteiro(l.quantidade, 1, MAX_QUANTIDADE);
  }
  if (l.tipo === "bolo") {
    return kgValido(l.quantidade as number) && recheioValido(l.recheio) && formatoValido(l.formato);
  }
  if (l.tipo === "bento") {
    return inteiro(l.quantidade, 1, MAX_QUANTIDADE) && recheioValido(l.recheio);
  }
  if (l.tipo === "cento") {
    if (typeof l.quantidade !== "number" || !centosValidos(l.quantidade)) return false;
    if (!Array.isArray(l.sabores) || l.sabores.length === 0) return false;
    const nomes = new Set<string>();
    let soma = 0;
    for (const s of l.sabores as unknown[]) {
      if (typeof s !== "object" || s === null) return false;
      const sabor = s as Record<string, unknown>;
      if (!texto(sabor.nome) || nomes.has(sabor.nome)) return false;
      if (!inteiro(sabor.quantidade, 0, totalDoCento(l.quantidade)) || sabor.quantidade % PASSO_SABOR !== 0) return false;
      nomes.add(sabor.nome);
      soma += sabor.quantidade;
    }
    return soma === totalDoCento(l.quantidade);
  }
  return false;
}

export function lerCarrinho(salvo: string | null): LinhaCarrinho[] {
  if (!salvo) return [];
  try {
    const dados = JSON.parse(salvo) as unknown;
    if (typeof dados !== "object" || dados === null) return [];
    const { versao, linhas } = dados as { versao?: unknown; linhas?: unknown };
    if (versao !== VERSAO_CARRINHO || !Array.isArray(linhas)) return [];
    return linhas.filter(linhaValida).slice(0, MAX_LINHAS);
  } catch {
    return [];
  }
}

export function escreverCarrinho(linhas: LinhaCarrinho[]): string {
  return JSON.stringify({ versao: VERSAO_CARRINHO, linhas });
}
