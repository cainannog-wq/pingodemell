import type { CorpoPedido, RespostaPedido } from "./envio";

// Chamada do navegador a POST /api/pedidos, com tempo limite. Classifica a
// resposta no que a tela do checkout precisa decidir (PR
// confirmacao-e-gravacao):
// - ok: gravado (201) ou o mesmo pedido de antes (200, chave repetida);
// - desligado: interruptor desligado (409), segue no modo sem registro;
// - invalido: o servidor recusou o corpo (4xx fora 409/429, inclusive 413).
//   Reenviar o mesmo corpo falha igual: sem "Tentar de novo";
// - limite: 429, com os segundos de espera;
// - falha: rede, tempo esgotado, 5xx ou resposta ilegível. "Tentar de novo"
//   com a MESMA chave.

// Espera do navegador. A função da Netlify tem 60 s de limite (plano
// Personal, rota síncrona); 15 s sobra para o caso normal (o banco responde
// em menos de 1 s) e, se estourar, a mesma chave evita pedido em dobro.
export const TEMPO_LIMITE_MS = 15_000;

export type ResultadoEnvio =
  | { tipo: "ok"; resposta: RespostaPedido }
  | { tipo: "desligado" }
  | { tipo: "invalido"; mensagem: string }
  | { tipo: "limite"; esperaSegundos: number }
  | { tipo: "falha" };

function respostaValida(v: unknown): v is RespostaPedido {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (
    Number.isInteger(r.numero) &&
    Number.isInteger(r.subtotal_centavos) &&
    Number.isInteger(r.total_centavos) &&
    Array.isArray(r.itens) &&
    r.itens.every((i) => i && typeof i === "object" && Number.isInteger((i as { valor_centavos?: unknown }).valor_centavos))
  );
}

export async function enviarPedido(
  corpo: CorpoPedido,
  { tempoLimiteMs = TEMPO_LIMITE_MS, buscar = fetch }: { tempoLimiteMs?: number; buscar?: typeof fetch } = {}
): Promise<ResultadoEnvio> {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), tempoLimiteMs);
  try {
    const res = await buscar("/api/pedidos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
      signal: controle.signal,
    });
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (res.status === 200 || res.status === 201) {
      return respostaValida(json) ? { tipo: "ok", resposta: json } : { tipo: "falha" };
    }
    if (res.status === 409) return { tipo: "desligado" };
    if (res.status === 429) {
      const doCabecalho = Number(res.headers.get("Retry-After"));
      const doCorpo = Number(json?.espera_segundos);
      const espera = Number.isFinite(doCabecalho) && doCabecalho > 0 ? doCabecalho : Number.isFinite(doCorpo) && doCorpo > 0 ? doCorpo : 3600;
      return { tipo: "limite", esperaSegundos: Math.ceil(espera) };
    }
    if (res.status >= 400 && res.status < 500) {
      const mensagem = typeof json?.mensagem === "string" && json.mensagem.length <= 300 ? json.mensagem : "O site não aceitou o pedido.";
      return { tipo: "invalido", mensagem };
    }
    return { tipo: "falha" };
  } catch {
    return { tipo: "falha" };
  } finally {
    clearTimeout(relogio);
  }
}
