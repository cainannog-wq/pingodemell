import { STEP_QUANTIDADE_VALUES, type StepQuantidade } from "@/lib/produtos/types";
import { formatoValido, kgValido, type FormatoBolo } from "@/lib/vitrine/bolo";
import { centosValidos, PASSO_SABOR, totalDoCento } from "@/lib/vitrine/cento";
import {
  MAX_QUANTIDADE,
  normalizarQuantidade,
  passoQuantidade,
  quantidadeInicial,
  quantidadeMaxima,
} from "@/lib/vitrine/quantidade";

// Carrinho do site público: regras puras, cobertas por teste. O estado
// fica no navegador (localStorage, src/lib/carrinho/armazenamento.ts) e é
// lido pelo CarrinhoProvider. Nada aqui vale como verdade para o pedido:
// nome, preço, foto, mínimo e step de cada linha são uma cópia do momento em
// que o item foi adicionado. A página do carrinho NÃO consulta o banco: mostra
// e soma o que está gravado (risco aceito, decisão do Cainan). O servidor
// também não reconfere nada disso no banco (produto ativo, preço atual,
// recheio, id que ainda existe): grava o pedido com o valor da linha e a
// atendente ajusta pelo WhatsApp (PR confirmacao-e-gravacao). Ele confere só
// a forma e os limites (src/lib/pedidos/validacao.ts).

export const VERSAO_CARRINHO = 1;
export const MAX_LINHAS = 50;
export const OBSERVACAO_MAX = 300;

type LinhaBase = {
  // Identificador da linha (não do produto): duas linhas do mesmo produto
  // com observações diferentes são linhas diferentes.
  id: string;
  produtoId: string;
  slug: string | null;
  // Retrato do momento da adição: é o que vai para o pedido.
  nome: string;
  preco: number;
  // Observação da cliente para este item (opcional, texto livre). Vai com o
  // item para a mensagem do WhatsApp e para o registro do pedido; é
  // diferente das observações do pedido inteiro, no checkout.
  observacao: string | null;
  // Capa do produto no momento da adição, só para exibir. Opcional: linha de
  // antes deste campo aparece com o fundo da marca.
  foto?: string | null;
};

export type LinhaAvulso = LinhaBase & {
  tipo: "normal";
  unidade_venda: string | null;
  // Na unidade de venda, inteira.
  quantidade: number;
  // Pedido mínimo e step do produto no momento da adição, para a página do
  // carrinho travar a quantidade sem consultar o banco. Opcionais: linha sem
  // eles não tem controle de quantidade, só remover.
  pedidoMinimo?: number;
  step?: StepQuantidade;
};

export type LinhaCento = LinhaBase & {
  tipo: "cento";
  // Número de centos (1, 2, 3...).
  quantidade: number;
  // Uma combinação só para o total (100 × centos), na ordem dos sabores.
  sabores: { nome: string; quantidade: number }[];
};

// Recheio escolhido (Bolo e Bento Cake). O id aponta para public.recheios e
// vai com o pedido; o servidor confere só o formato dele, não se o recheio
// continua ativo nem o preço atual.
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
  // Pedido mínimo do produto no momento da adição (o Bento não tem step).
  pedidoMinimo?: number;
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

// --- Página do carrinho ------------------------------------------------------
// Tudo em cima do que está gravado na linha, sem banco.

// Mínimo e step da linha para o seletor da página do carrinho, ou null quando
// a linha não tem controle de quantidade: Cento e Bolo (só se remove e se
// adiciona de novo pela interna) e linha antiga sem os campos gravados. O
// Smash Cake é um avulso; o Bento Cake não usa step.
export function controleDaQuantidade(linha: LinhaCarrinho): { minimo: number; step: StepQuantidade } | null {
  if (linha.tipo === "normal" && linha.pedidoMinimo !== undefined && linha.step !== undefined) {
    return { minimo: linha.pedidoMinimo, step: linha.step };
  }
  if (linha.tipo === "bento" && linha.pedidoMinimo !== undefined) {
    return { minimo: linha.pedidoMinimo, step: "livre" };
  }
  return null;
}

export type LimitesQuantidade = { minimo: number; maximo: number; podeMenos: boolean; podeMais: boolean };

// Menor e maior quantidade aceitas na linha, e se os botões − e + andam.
export function limitesDaLinha(linha: LinhaCarrinho): LimitesQuantidade | null {
  const controle = controleDaQuantidade(linha);
  if (!controle) return null;
  const minimo = quantidadeInicial(controle.minimo, controle.step);
  const maximo = quantidadeMaxima(controle.step);
  return { minimo, maximo, podeMenos: linha.quantidade > minimo, podeMais: linha.quantidade < maximo };
}

// Troca a quantidade de uma linha com controle, levando o valor para o mais
// próximo aceito (mínimo, step e teto). Linha sem controle não muda.
export function alterarQuantidade(linhas: LinhaCarrinho[], id: string, quantidade: number): LinhaCarrinho[] {
  return linhas.map((l) => {
    if (l.id !== id) return l;
    const controle = controleDaQuantidade(l);
    if (!controle || (l.tipo !== "normal" && l.tipo !== "bento")) return l;
    return { ...l, quantidade: normalizarQuantidade(quantidade, controle.minimo, controle.step) };
  });
}

// Um passo do step (botões − e +) na linha.
export function passoNaLinha(linha: LinhaCarrinho, direcao: 1 | -1): number {
  const controle = controleDaQuantidade(linha);
  if (!controle) return linha.quantidade;
  return passoQuantidade(linha.quantidade, direcao, controle.minimo, controle.step);
}

// Subtotal da linha, em centavos inteiros para a soma não acumular erro de
// ponto flutuante. Sempre preço gravado × quantidade gravada: avulso e Bento
// = unidades; Cento = centos (preço por cento); Bolo = kg (preço por kg do
// recheio).
export function subtotalEmCentavos(linha: LinhaCarrinho): number {
  return Math.round(linha.preco * 100) * linha.quantidade;
}

export function subtotalDaLinha(linha: LinhaCarrinho): number {
  return subtotalEmCentavos(linha) / 100;
}

export function totalDoCarrinho(linhas: LinhaCarrinho[]): number {
  return linhas.reduce((soma, l) => soma + subtotalEmCentavos(l), 0) / 100;
}

// Desfazer remoção: põe a linha de volta onde estava. `ordem` são os ids na
// ordem que a lista tinha antes de tirar a linha; ela volta logo antes da
// primeira linha que vinha depois dela e ainda existe (ou no fim). Assim vale
// mesmo que outras linhas tenham sido removidas ou desfeitas no meio. Se a
// linha já está na lista, nada muda.
export function reinserirLinha(linhas: LinhaCarrinho[], linha: LinhaCarrinho, ordem: string[]): LinhaCarrinho[] {
  if (linhas.some((l) => l.id === linha.id) || linhas.length >= MAX_LINHAS) return linhas;
  const seguintes = new Set(ordem.slice(ordem.indexOf(linha.id) + 1));
  const indice = linhas.findIndex((l) => seguintes.has(l.id));
  if (indice === -1) return [...linhas, linha];
  return [...linhas.slice(0, indice), linha, ...linhas.slice(indice)];
}

// --- Editar Cento e Bolo -----------------------------------------------------
// O ícone de editar da linha leva à interna do produto com ?editar={id da
// linha}. A linha só muda quando a edição é confirmada, e aí é trocada por
// outra, de um por um, na mesma posição.

export type LinhaEditavel = LinhaCento | LinhaBolo;

// Cento e Bolo (Avulso, Smash Cake e Bento Cake ajustam a quantidade direto
// no carrinho). Sem slug não há para onde levar, então não edita.
export function podeEditarNaInterna(linha: LinhaCarrinho): linha is LinhaEditavel & { slug: string } {
  return (linha.tipo === "cento" || linha.tipo === "bolo") && linha.slug !== null;
}

// Linha que o ?editar= aponta, se ela ainda serve: existe, é do mesmo produto
// e do mesmo tipo da interna. Senão null (vínculo perdido).
export function linhaParaEditar(
  linhas: LinhaCarrinho[],
  id: string,
  produtoId: string,
  tipo: LinhaEditavel["tipo"]
): LinhaEditavel | null {
  const linha = linhas.find((l) => l.id === id);
  if (!linha || (linha.tipo !== "cento" && linha.tipo !== "bolo")) return null;
  return linha.produtoId === produtoId && linha.tipo === tipo ? linha : null;
}

// Retrato da linha no instante em que a edição abriu. A troca só vale se a
// linha ainda for exatamente esta (não foi removida nem mudou em outra aba).
export function assinaturaDaLinha(linha: LinhaCarrinho): string {
  return JSON.stringify(linha);
}

// Troca a linha `id` pela versão editada, na mesma posição e com o mesmo id.
// Nunca junta com outra linha (nem se a composição ficar igual à de outra) e
// nunca cria linha nova: se o id não existe, o produto ou o tipo não batem ou
// a linha nova é inválida, devolve a lista como estava.
export function substituirLinha(linhas: LinhaCarrinho[], id: string, nova: LinhaCarrinho): LinhaCarrinho[] {
  const atual = linhas.find((l) => l.id === id);
  if (!atual || atual.produtoId !== nova.produtoId || atual.tipo !== nova.tipo) return linhas;
  const trocada = { ...nova, id } as LinhaCarrinho;
  if (!linhaValida(trocada)) return linhas;
  return linhas.map((l) => (l.id === id ? trocada : l));
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

  if (l.foto !== undefined && l.foto !== null && !texto(l.foto, 2000)) return false;

  if (l.tipo === "normal") {
    if (l.unidade_venda !== null && !texto(l.unidade_venda, 20)) return false;
    if (l.pedidoMinimo !== undefined && !inteiro(l.pedidoMinimo, 1, MAX_QUANTIDADE)) return false;
    if (l.step !== undefined && !(STEP_QUANTIDADE_VALUES as readonly unknown[]).includes(l.step)) return false;
    return inteiro(l.quantidade, 1, MAX_QUANTIDADE);
  }
  if (l.tipo === "bolo") {
    return kgValido(l.quantidade as number) && recheioValido(l.recheio) && formatoValido(l.formato);
  }
  if (l.tipo === "bento") {
    if (l.pedidoMinimo !== undefined && !inteiro(l.pedidoMinimo, 1, MAX_QUANTIDADE)) return false;
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

// Validade do carrinho (PR perf/vitrine-consultas-cache): o carrinho guardado
// no navegador vale até VALIDADE_CARRINHO_HORAS depois da última alteração
// (adicionar, remover, ajustar quantidade ou editar); cada alteração renova
// o prazo. Passado o prazo, é descartado em silêncio ao carregar. O instante
// da última alteração vai no campo opcional alteradoEm, na mesma chave e
// versão: carrinho gravado antes deste campo continua valendo e recebe a
// data na primeira leitura. Compara dois instantes, não decide "que dia é"
// (regra do fuso no CLAUDE.md).
export const VALIDADE_CARRINHO_HORAS = 48;
const VALIDADE_CARRINHO_MS = VALIDADE_CARRINHO_HORAS * 60 * 60 * 1000;

export type CarrinhoLido = {
  linhas: LinhaCarrinho[];
  // Passou do prazo: a leitura devolve vazio e o guardado deve ser apagado.
  vencido: boolean;
  // Gravado antes do campo de data (ou com data ilegível): vale, e deve
  // receber a data desta leitura.
  semData: boolean;
};

export function lerCarrinhoGuardado(salvo: string | null, agora: number): CarrinhoLido {
  const nada = { linhas: [], vencido: false, semData: false };
  if (!salvo) return nada;
  try {
    const dados = JSON.parse(salvo) as unknown;
    if (typeof dados !== "object" || dados === null) return nada;
    const { versao, linhas, alteradoEm } = dados as { versao?: unknown; linhas?: unknown; alteradoEm?: unknown };
    if (versao !== VERSAO_CARRINHO || !Array.isArray(linhas)) return nada;
    const instante = typeof alteradoEm === "string" ? Date.parse(alteradoEm) : NaN;
    if (Number.isFinite(instante) && agora - instante > VALIDADE_CARRINHO_MS) return { linhas: [], vencido: true, semData: false };
    return { linhas: linhas.filter(linhaValida).slice(0, MAX_LINHAS), vencido: false, semData: !Number.isFinite(instante) };
  } catch {
    return nada;
  }
}

export function lerCarrinho(salvo: string | null, agora: number = Date.now()): LinhaCarrinho[] {
  return lerCarrinhoGuardado(salvo, agora).linhas;
}

// Toda gravação é uma alteração: renova o prazo.
export function escreverCarrinho(linhas: LinhaCarrinho[], agora: number = Date.now()): string {
  return JSON.stringify({ versao: VERSAO_CARRINHO, alteradoEm: new Date(agora).toISOString(), linhas });
}

// O mesmo texto guardado, só com a data acrescentada (carrinho de antes do
// campo alteradoEm). As linhas ficam exatamente como estavam.
export function carimbarCarrinho(salvo: string, agora: number): string {
  const dados = JSON.parse(salvo) as Record<string, unknown>;
  return JSON.stringify({ ...dados, alteradoEm: new Date(agora).toISOString() });
}
