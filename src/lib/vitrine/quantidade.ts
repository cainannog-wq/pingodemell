import type { StepQuantidade } from "@/lib/produtos/types";

// Quantidade de um produto avulso (tipo normal) na interna e no carrinho,
// numa função pura coberta por teste. Sempre inteira, na unidade de venda
// (em kg, 1 = 1 kg: não existe meio quilo). O Cento não passa por aqui:
// conta em número de centos (src/lib/vitrine/cento.ts).

// Teto de segurança do seletor (e da leitura do carrinho salvo no
// navegador). Pedido maior que isso é conversa no WhatsApp.
export const MAX_QUANTIDADE = 9999;

export function passoDoStep(step: StepQuantidade): number {
  if (step === "multiplos_5") return 5;
  if (step === "multiplos_10") return 10;
  return 1;
}

// Menor quantidade aceita: o pedido mínimo, subindo até o múltiplo do step
// quando não bate (mínimo 12 em múltiplos de 5 → 15).
export function quantidadeInicial(minimo: number, step: StepQuantidade): number {
  const passo = passoDoStep(step);
  const piso = Math.max(1, Math.floor(Number.isFinite(minimo) ? minimo : 1));
  return Math.ceil(piso / passo) * passo;
}

// Maior quantidade aceita: o teto, descendo até o múltiplo do step.
export function quantidadeMaxima(step: StepQuantidade): number {
  const passo = passoDoStep(step);
  return Math.floor(MAX_QUANTIDADE / passo) * passo;
}

// Por que a quantidade não serve (texto pra cliente), ou null se serve.
export function erroQuantidade(quantidade: number, minimo: number, step: StepQuantidade): string | null {
  if (!Number.isInteger(quantidade)) return "Use um número inteiro.";
  const inicial = quantidadeInicial(minimo, step);
  if (quantidade < inicial) return `Quantidade mínima: ${inicial}`;
  if (quantidade > quantidadeMaxima(step)) return `Para mais de ${quantidadeMaxima(step)}, fale com a gente no WhatsApp.`;
  const passo = passoDoStep(step);
  if (quantidade % passo !== 0) return `Escolha em múltiplos de ${passo}.`;
  return null;
}

export function quantidadeValida(quantidade: number, minimo: number, step: StepQuantidade): boolean {
  return erroQuantidade(quantidade, minimo, step) === null;
}

// Leva qualquer número (inclusive digitado errado) para a quantidade
// aceita mais próxima: para cima até o múltiplo do step, entre o mínimo e
// o teto. Texto vazio ou inválido volta para o mínimo.
export function normalizarQuantidade(quantidade: number, minimo: number, step: StepQuantidade): number {
  const inicial = quantidadeInicial(minimo, step);
  if (!Number.isFinite(quantidade)) return inicial;
  const passo = passoDoStep(step);
  const arredondada = Math.ceil(Math.floor(quantidade) / passo) * passo;
  return Math.min(quantidadeMaxima(step), Math.max(inicial, arredondada));
}

// Botões − e +: um passo do step por clique, sem passar do mínimo nem do
// teto.
export function passoQuantidade(atual: number, direcao: 1 | -1, minimo: number, step: StepQuantidade): number {
  const base = normalizarQuantidade(atual, minimo, step);
  return normalizarQuantidade(base + direcao * passoDoStep(step), minimo, step);
}
