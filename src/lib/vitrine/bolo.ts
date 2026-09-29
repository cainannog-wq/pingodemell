import { formatMoeda } from "@/lib/pedidos/format";

// Bolo (tipo "bolo") na interna e no carrinho: tamanho em kg, formato e
// recheio. Regras puras cobertas por teste. O preço é sempre
// R$/kg do recheio × kg (src/lib/recheios/regras.ts); o acréscimo de
// decoração personalizada é orçado à parte no WhatsApp e nunca entra no
// preço do site nem no do pedido.

export const FORMATOS_BOLO = ["redondo", "quadrado"] as const;
export type FormatoBolo = (typeof FORMATOS_BOLO)[number];

export const FORMATO_BOLO_LABELS: Record<FormatoBolo, string> = {
  redondo: "Redondo",
  quadrado: "Quadrado",
};

// Tamanho de 1 em 1 kg (regra do projeto: em kg não existe meio quilo).
export const KG_MINIMO = 1;
// Até aqui, sem aviso. Acima, o site avisa para combinar pelo WhatsApp, mas
// não bloqueia.
export const KG_AVISO = 10;
// Teto técnico do seletor (e da leitura do carrinho salvo no navegador),
// só para não aceitar número absurdo digitado.
export const KG_MAXIMO = 50;

export const TEXTO_FOTO_REFERENCIA = "Aceita foto de referência, envie pelo WhatsApp depois de confirmar.";
export const TEXTO_DECORACAO = "Decoração personalizada é orçada à parte, no WhatsApp, depois do pedido.";

export function textoAvisoKg(kg: number): string | null {
  if (!Number.isFinite(kg) || kg <= KG_AVISO) return null;
  return `Para bolos acima de ${KG_AVISO} kg, combine com a gente pelo WhatsApp.`;
}

export function kgValido(kg: number): boolean {
  return Number.isInteger(kg) && kg >= KG_MINIMO && kg <= KG_MAXIMO;
}

// Por que o tamanho não serve (texto pra cliente), ou null se serve.
export function erroKg(kg: number): string | null {
  if (!Number.isInteger(kg)) return "Use um número inteiro de quilos.";
  if (kg < KG_MINIMO) return `Tamanho mínimo: ${KG_MINIMO} kg`;
  if (kg > KG_MAXIMO) return `Para mais de ${KG_MAXIMO} kg, fale com a gente no WhatsApp.`;
  return null;
}

// Leva qualquer número para o tamanho aceito mais próximo.
export function normalizarKg(kg: number): number {
  if (!Number.isFinite(kg)) return KG_MINIMO;
  return Math.min(KG_MAXIMO, Math.max(KG_MINIMO, Math.floor(kg)));
}

export function passoKg(atual: number, direcao: 1 | -1): number {
  return normalizarKg(normalizarKg(atual) + direcao);
}

export function formatoValido(v: unknown): v is FormatoBolo {
  return typeof v === "string" && (FORMATOS_BOLO as readonly string[]).includes(v);
}

// "2 kg × R$ 45,00".
export function detalheDoBolo(precoKg: number, kg: number): string {
  return `${kg} kg × ${formatMoeda(precoKg)}`;
}
