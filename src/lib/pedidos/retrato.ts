import type { Formato } from "./mensagem";

// O que fica no navegador depois do envio (PR confirmacao-e-gravacao), em
// sessionStorage — só na aba em uso, some quando ela fecha, como a Política
// diz para os dados do formulário:
//
// - pdm-pedido-enviado-v1: o retrato do pedido enviado (número, resumo,
//   totais devolvidos pelo servidor e o texto pronto da mensagem). A tela
//   /confirmacao lê SÓ daqui e nunca consulta o banco pelo número: o número
//   é sequencial, e uma consulta por ele exporia pedidos de outras pessoas.
// - pdm-checkout-chave-v1: a chave de idempotência (uuid, sem dado pessoal).
//   Nasce ao abrir o checkout; reenviar depois de recarregar a página usa a
//   mesma; só é trocada depois de um sucesso.
//
// Se o navegador bloquear o sessionStorage, o retrato vive só na memória da
// página (recarregar leva à tela neutra) e a chave dura até recarregar.

export const CHAVE_RETRATO = "pdm-pedido-enviado-v1";
export const CHAVE_IDEMPOTENCIA = "pdm-checkout-chave-v1";
const VERSAO = 1;

export type LinhaDoRetrato = {
  nome: string;
  // "50 un", "2 centos", "3 kg"...
  quantidade: string;
  // Sabores, recheio e formato; observação do item à parte.
  detalhe: string | null;
  observacao: string | null;
  valor_centavos: number;
};

export type Retrato = {
  // "registrado": o servidor gravou (tem número). "sem_registro": o
  // interruptor está desligado; nada foi gravado e o carrinho só é esvaziado
  // depois do clique no botão do WhatsApp (pendenteEsvaziar).
  modo: "registrado" | "sem_registro";
  numero: number | null;
  mensagem: string;
  formato: Formato;
  // A URL do wa.me cabe no orçamento.
  cabe: boolean;
  linhas: LinhaDoRetrato[];
  totalCentavos: number;
  temBolo: boolean;
  // Item com prazo de produção maior que a data escolhida.
  prazo: { nome: string; dias: number } | null;
  pendenteEsvaziar: boolean;
  // GA4 (PR 2 da Fase 4): eventos deste pedido já enviados, para cada um
  // sair uma vez só (recarregar a /confirmacao ou clicar duas vezes não
  // repete). Opcional: retrato sem o campo conta como nada enviado.
  medido?: Medido;
};

export type Medido = { exibida: boolean; enviado: boolean };

let naMemoria: string | null = null;

function texto(v: unknown, max = 5000): v is string {
  return typeof v === "string" && v.length <= max;
}
function inteiro(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0;
}

export function lerRetratoDe(salvo: string | null): Retrato | null {
  if (!salvo) return null;
  try {
    const bruto = JSON.parse(salvo) as { versao?: unknown; retrato?: Record<string, unknown> };
    if (bruto?.versao !== VERSAO || !bruto.retrato || typeof bruto.retrato !== "object") return null;
    const r = bruto.retrato;
    if (r.modo !== "registrado" && r.modo !== "sem_registro") return null;
    if (r.modo === "registrado" && !inteiro(r.numero)) return null;
    if (!texto(r.mensagem, 20000) || !r.mensagem) return null;
    if (r.formato !== "completo" && r.formato !== "curto" && r.formato !== "minimo") return null;
    if (!Array.isArray(r.linhas) || !inteiro(r.totalCentavos)) return null;
    const linhas: LinhaDoRetrato[] = [];
    for (const l of r.linhas as Record<string, unknown>[]) {
      if (!l || !texto(l.nome, 300) || !texto(l.quantidade, 60) || !inteiro(l.valor_centavos)) return null;
      linhas.push({
        nome: l.nome,
        quantidade: l.quantidade,
        detalhe: texto(l.detalhe) ? l.detalhe : null,
        observacao: texto(l.observacao) ? l.observacao : null,
        valor_centavos: l.valor_centavos,
      });
    }
    const prazo = r.prazo as { nome?: unknown; dias?: unknown } | null;
    return {
      modo: r.modo,
      numero: r.modo === "registrado" ? (r.numero as number) : null,
      mensagem: r.mensagem,
      formato: r.formato,
      cabe: r.cabe === true,
      linhas,
      totalCentavos: r.totalCentavos,
      temBolo: r.temBolo === true,
      prazo: prazo && texto(prazo.nome, 300) && inteiro(prazo.dias) ? { nome: prazo.nome, dias: prazo.dias } : null,
      pendenteEsvaziar: r.pendenteEsvaziar === true,
      medido: r.medido === undefined ? undefined : lerMedido(r.medido),
    };
  } catch {
    return null;
  }
}

function lerMedido(v: unknown): Medido {
  const m = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  return { exibida: m.exibida === true, enviado: m.enviado === true };
}

export function lerRetrato(): Retrato | null {
  try {
    return lerRetratoDe(window.sessionStorage.getItem(CHAVE_RETRATO));
  } catch {
    return lerRetratoDe(naMemoria);
  }
}

export function salvarRetrato(retrato: Retrato): void {
  const salvo = JSON.stringify({ versao: VERSAO, retrato });
  naMemoria = salvo;
  try {
    window.sessionStorage.setItem(CHAVE_RETRATO, salvo);
  } catch {
    // Sem sessionStorage: fica só na memória da página.
  }
}

export function apagarRetrato(): void {
  naMemoria = null;
  try {
    window.sessionStorage.removeItem(CHAVE_RETRATO);
  } catch {
    // nada a apagar
  }
}

// ---------- Chave de idempotência ----------

let chaveNaMemoria: string | null = null;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function novoUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// A chave atual (cria uma se não houver).
export function chaveIdempotencia(): string {
  try {
    const salva = window.sessionStorage.getItem(CHAVE_IDEMPOTENCIA);
    if (salva && UUID.test(salva)) return salva;
    const nova = novoUuid();
    window.sessionStorage.setItem(CHAVE_IDEMPOTENCIA, nova);
    return nova;
  } catch {
    chaveNaMemoria ??= novoUuid();
    return chaveNaMemoria;
  }
}

// Depois de um sucesso: o próximo pedido é outro.
export function trocarChaveIdempotencia(): void {
  chaveNaMemoria = null;
  try {
    window.sessionStorage.removeItem(CHAVE_IDEMPOTENCIA);
  } catch {
    // sem sessionStorage: a memória já foi limpa
  }
}

// Só para testes.
export function reiniciarRetratoParaTeste(): void {
  naMemoria = null;
  chaveNaMemoria = null;
}
