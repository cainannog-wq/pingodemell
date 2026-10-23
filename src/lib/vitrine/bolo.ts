import { formatMoeda } from "@/lib/pedidos/format";

// Bolo (tipo "bolo") na interna e no carrinho: tamanho em kg, formato e
// recheio. Regras puras cobertas por teste. O preço é sempre
// R$/kg do recheio × kg (src/lib/recheios/regras.ts); o acréscimo de
// decoração personalizada é orçado à parte no WhatsApp e nunca entra no
// preço do site nem no do pedido.

// Formatos que a cliente pode escolher. "quadrado" foi o nome antigo do
// retangular: continua existindo só em registro já gravado (carrinho, pedido,
// kit) e é lido e exibido normalmente, com as regras do retangular, mas nunca
// é oferecido nem gravado em pedido novo.
export const FORMATOS_BOLO = ["redondo", "retangular"] as const;
export const FORMATOS_BOLO_ANTIGOS = ["quadrado"] as const;
export type FormatoBolo = (typeof FORMATOS_BOLO)[number] | (typeof FORMATOS_BOLO_ANTIGOS)[number];

export const FORMATO_BOLO_LABELS: Record<FormatoBolo, string> = {
  redondo: "Redondo",
  retangular: "Retangular",
  quadrado: "Quadrado",
};

// Para as regras de peso, o quadrado antigo vale como retangular.
export function formatoParaRegras(formato: FormatoBolo): (typeof FORMATOS_BOLO)[number] {
  return formato === "redondo" ? "redondo" : "retangular";
}

// Tamanho do bolo tradicional em kg, de 1 em 1 (regra do projeto: em kg não
// existe meio quilo). Limites por formato (pedido da Taami, 23/10/2026).
export const LIMITES_KG: Record<(typeof FORMATOS_BOLO)[number], { min: number; max: number }> = {
  retangular: { min: 2, max: 5 },
  redondo: { min: 1, max: 4 },
};

export function limitesKg(formato: FormatoBolo): { min: number; max: number } {
  return LIMITES_KG[formatoParaRegras(formato)];
}

// Menor e maior tamanho entre os formatos: o que a leitura do carrinho e o
// servidor usam como teto absoluto antes de olhar o formato.
export const KG_MINIMO = Math.min(...Object.values(LIMITES_KG).map((l) => l.min));
export const KG_MAXIMO = Math.max(...Object.values(LIMITES_KG).map((l) => l.max));

export const TEXTO_FOTO_REFERENCIA = "Aceita foto de referência, envie pelo WhatsApp depois de confirmar.";
export const TEXTO_DECORACAO = "Decoração personalizada é orçada à parte, no WhatsApp, depois do pedido.";

export function kgValido(kg: number, formato: FormatoBolo): boolean {
  const { min, max } = limitesKg(formato);
  return Number.isInteger(kg) && kg >= min && kg <= max;
}

const nomeDoFormato = (formato: FormatoBolo) => FORMATO_BOLO_LABELS[formatoParaRegras(formato)].toLowerCase();

// Por que o tamanho não serve (texto pra cliente), ou null se serve.
export function erroKg(kg: number, formato: FormatoBolo): string | null {
  const { min, max } = limitesKg(formato);
  if (!Number.isInteger(kg)) return "Use um número inteiro de quilos.";
  if (kg < min) return `Tamanho mínimo para bolo ${nomeDoFormato(formato)}: ${min} kg`;
  if (kg > max) return `Tamanho máximo para bolo ${nomeDoFormato(formato)}: ${max} kg`;
  return null;
}

// Leva qualquer número para o tamanho aceito mais próximo do formato.
export function normalizarKg(kg: number, formato: FormatoBolo): number {
  const { min, max } = limitesKg(formato);
  if (!Number.isFinite(kg)) return min;
  return Math.min(max, Math.max(min, Math.floor(kg)));
}

export function passoKg(atual: number, direcao: 1 | -1, formato: FormatoBolo): number {
  return normalizarKg(normalizarKg(atual, formato) + direcao, formato);
}

// Troca de formato com o tamanho já escolhido: se ele sai da faixa do novo
// formato, vai para o limite mais próximo e a cliente é avisada.
export function ajustarKgAoTrocarFormato(
  kg: number,
  novoFormato: FormatoBolo
): { kg: number; aviso: string | null } {
  const { min, max } = limitesKg(novoFormato);
  if (!Number.isInteger(kg) || (kg >= min && kg <= max)) return { kg, aviso: null };
  const ajustado = normalizarKg(kg, novoFormato);
  return {
    kg: ajustado,
    aviso: `Bolo ${nomeDoFormato(novoFormato)} aceita de ${min} a ${max} kg. Ajustamos o tamanho para ${ajustado} kg.`,
  };
}

// Lê qualquer formato já gravado, inclusive o "quadrado" antigo.
export function formatoValido(v: unknown): v is FormatoBolo {
  return typeof v === "string" && ([...FORMATOS_BOLO, ...FORMATOS_BOLO_ANTIGOS] as readonly string[]).includes(v);
}

// Formato como entra em pedido novo (texto da mensagem, item gravado): o
// quadrado antigo, vindo de um carrinho que ficou aberto, sai como retangular.
export function formatoDoPedido(formato: FormatoBolo): (typeof FORMATOS_BOLO)[number] {
  return formatoParaRegras(formato);
}

// "2 kg × R$ 45,00".
export function detalheDoBolo(precoKg: number, kg: number): string {
  return `${kg} kg × ${formatMoeda(precoKg)}`;
}
