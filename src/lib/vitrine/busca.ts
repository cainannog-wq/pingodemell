// Busca da Lista de produtos (/produtos), só pelo nome do produto, numa
// função pura coberta por teste (busca.test.ts).
//
// Busca e nome passam pela mesma normalização: sem acento ("ç" vira "c",
// "ã" vira "a"), minúsculas, e todo caractere que não é letra nem número
// vira espaço (assim "coca cola" acha "Coca-cola" e "8g" acha "(8g)").
// O produto aparece se o nome tem CADA palavra digitada, em qualquer ordem
// e em qualquer parte do nome ("mel pao" acha "Pão de Mel").

// Maior busca aceita da URL; o resto é ignorado (o campo também limita).
export const MAX_BUSCA = 80;

export function normalizarParaBusca(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Lê o `?busca=` da URL: primeiro valor se repetido, espaços repetidos
// juntados, sem espaço nas pontas, até MAX_BUSCA caracteres. Só espaços,
// vazio ou ausente: "" (sem busca).
export function lerBusca(valor: string | string[] | undefined): string {
  const texto = Array.isArray(valor) ? valor[0] : valor;
  if (!texto) return "";
  return texto.replace(/\s+/g, " ").trim().slice(0, MAX_BUSCA).trim();
}

// Palavras da busca já normalizadas. Busca só com sinais ("--", "!!") não
// tem palavra nenhuma e não filtra nada.
export function palavrasDaBusca(busca: string): string[] {
  return normalizarParaBusca(busca).split(" ").filter(Boolean);
}

export function nomeCasaComBusca(nome: string, palavras: string[]): boolean {
  if (palavras.length === 0) return true;
  const alvo = normalizarParaBusca(nome);
  return palavras.every((p) => alvo.includes(p));
}
