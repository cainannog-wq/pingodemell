import { diaDaSemana, lerDataIso, somarDias } from "@/lib/tempo/brasilia";

// Regras da data e da hora do checkout, em funções puras cobertas por
// teste. "Hoje" chega sempre de fora, calculado por hojeBrasilia()
// (src/lib/tempo/brasilia.ts): nenhuma conta aqui olha o relógio.
//
// O que BLOQUEIA uma data (ela não pode ser escolhida no calendário):
// - hoje ou antes: todo pedido pede pelo menos 1 dia de antecedência;
// - segunda-feira, sempre (a reabertura de segunda do admin é exceção
//   manual, fora do site: segunda_reaberturas não entra aqui);
// - dia sem produção marcado no admin (dias_off);
// - sábado ou domingo pedido depois da quinta-feira daquela semana
//   ("Festa no sábado ou domingo? Faça o pedido até quinta-feira").
//   Com isso, pedido feito na sexta, no sábado ou no domingo fica para a
//   terça seguinte (segunda é fechada);
// - mais de LIMITE_DIAS_A_FRENTE dias à frente.
//
// O que NÃO bloqueia: o prazo de produção dos itens. Data liberada antes de
// "hoje + maior prazo do carrinho" pode ser escolhida; a tela só avisa para
// falar no WhatsApp (decisão do Cainan, PR checkout-de-verdade).

export const SEGUNDA = 1;
export const QUINTA = 4;
export const SABADO = 6;
export const DOMINGO = 0;

// Até onde o calendário vai. Pedido para mais longe é conversa no WhatsApp.
export const LIMITE_DIAS_A_FRENTE = 180;

export type MotivoBloqueio = "antecedencia" | "segunda" | "dia-off" | "fim-de-semana" | "longe";

export type DiasOff = ReadonlySet<string>;

// Quinta-feira anterior ao fim de semana da data (sábado: 2 dias antes;
// domingo: 3 dias antes). Só faz sentido para sábado e domingo.
export function quintaDoFimDeSemana(dataIso: string): string {
  return somarDias(dataIso, diaDaSemana(dataIso) === SABADO ? -2 : -3);
}

// Por que a data não pode ser escolhida, ou null se pode.
export function motivoBloqueio(dataIso: string, hoje: string, diasOff: DiasOff): MotivoBloqueio | null {
  if (dataIso <= hoje) return "antecedencia";
  if (dataIso > somarDias(hoje, LIMITE_DIAS_A_FRENTE)) return "longe";
  const dia = diaDaSemana(dataIso);
  if (dia === SEGUNDA) return "segunda";
  if (diasOff.has(dataIso)) return "dia-off";
  if ((dia === SABADO || dia === DOMINGO) && hoje > quintaDoFimDeSemana(dataIso)) return "fim-de-semana";
  return null;
}

export function dataPermitida(dataIso: string, hoje: string, diasOff: DiasOff): boolean {
  return lerDataIso(dataIso) !== null && motivoBloqueio(dataIso, hoje, diasOff) === null;
}

// Primeira data que pode ser escolhida a partir de `aPartirDe` (inclusive),
// ou null se nenhuma até o limite.
export function primeiraDataPermitida(hoje: string, diasOff: DiasOff, aPartirDe: string = somarDias(hoje, 1)): string | null {
  let data = aPartirDe > hoje ? aPartirDe : somarDias(hoje, 1);
  const limite = somarDias(hoje, LIMITE_DIAS_A_FRENTE);
  while (data <= limite) {
    if (motivoBloqueio(data, hoje, diasOff) === null) return data;
    data = somarDias(data, 1);
  }
  return null;
}

// ---------- Prazo de produção ----------

export type PrazoDoItem = { nome: string; dias: number };

// O item mais demorado do carrinho: o maior prazo_producao_dias entre os
// produtos das linhas. `prazos` vem do banco (produtos ativos, id -> dias);
// linha de produto que não está lá (desativado ou excluído depois de entrar
// no carrinho) fica fora da conta, sem aviso: o carrinho não é reconferido
// no checkout. Empate: o primeiro da lista.
export function itemMaisDemorado(
  linhas: ReadonlyArray<{ produtoId: string; nome: string }>,
  prazos: Readonly<Record<string, number>>
): PrazoDoItem | null {
  let maior: PrazoDoItem | null = null;
  for (const linha of linhas) {
    const dias = prazos[linha.produtoId];
    if (typeof dias !== "number" || !Number.isFinite(dias) || dias <= 0) continue;
    if (!maior || dias > maior.dias) maior = { nome: linha.nome, dias };
  }
  return maior;
}

// Primeira data em que um produto com esse prazo fica pronto: hoje + dias.
export function prontoEm(hoje: string, dias: number): string {
  return somarDias(hoje, Math.max(0, Math.floor(dias)));
}

// A data escolhida vem antes de o item mais demorado ficar pronto? Só
// avisa (WhatsApp), nunca bloqueia.
export function prazoCurto(dataIso: string, hoje: string, maisDemorado: PrazoDoItem | null): boolean {
  if (!maisDemorado) return false;
  return dataIso < prontoEm(hoje, maisDemorado.dias);
}

// ---------- Horário ----------

// Horário da loja: terça a sábado, 9h às 18h; domingo, 9h às 15h; segunda
// fechado. Horários de 30 em 30 minutos, do abrir ao fechar (18h e 15h
// entram), sem o almoço (12h e 12h30), decisão do Cainan.
export const INTERVALO_MINUTOS = 30;
const ABRE = 9 * 60;
const FECHA_SEMANA = 18 * 60;
const FECHA_DOMINGO = 15 * 60;
export const HORARIOS_DE_ALMOCO = ["12:00", "12:30"];

export function horariosDoDia(dataIso: string): string[] {
  if (!lerDataIso(dataIso)) return [];
  const dia = diaDaSemana(dataIso);
  if (dia === SEGUNDA) return [];
  const fecha = dia === DOMINGO ? FECHA_DOMINGO : FECHA_SEMANA;
  const horarios: string[] = [];
  for (let m = ABRE; m <= fecha; m += INTERVALO_MINUTOS) {
    const hora = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    if (!HORARIOS_DE_ALMOCO.includes(hora)) horarios.push(hora);
  }
  return horarios;
}

// "09:00" -> "9h", "14:30" -> "14h30".
export function rotuloHorario(hora: string): string {
  const [h, m] = hora.split(":").map(Number);
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

// ---------- Texto ----------

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const DIAS_COMPLETOS = [
  "domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado",
];

export function nomeDoMes(mes: number): string {
  return MESES[mes - 1];
}

// "Sábado, 17 de outubro".
export function dataPorExtenso(dataIso: string): string {
  const [, mes, dia] = dataIso.split("-").map(Number);
  return `${DIAS[diaDaSemana(dataIso)]}, ${dia} de ${MESES[mes - 1]}`;
}

// "sábado, 17 de outubro de 2026" (rótulo do dia para leitor de tela).
export function dataCompleta(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split("-").map(Number);
  return `${DIAS_COMPLETOS[diaDaSemana(dataIso)]}, ${dia} de ${MESES[mes - 1]} de ${ano}`;
}

export const TEXTO_MOTIVO: Record<MotivoBloqueio, string> = {
  antecedencia: "fora do prazo",
  segunda: "segunda-feira, loja fechada",
  "dia-off": "dia sem produção",
  "fim-de-semana": "fim de semana fora do prazo",
  longe: "muito à frente, fale com a gente",
};
