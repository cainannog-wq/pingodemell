import { describe, expect, it, vi } from "vitest";
import { contextoDaGravacao, pedidoDeTeste } from "./ambiente";
import { montarCorpo } from "./envio";
import { enviarPedido, TEMPO_LIMITE_MS } from "./enviar";
import { CHAVE_TESTE, DADOS_TESTE, LINHAS_TESTE } from "./fixtura-teste";
import { lerRetratoDe } from "./retrato";

// Envio pelo navegador, ambiente e leitura do retrato (PR confirmacao-e-gravacao).

const CORPO = montarCorpo(DADOS_TESTE, LINHAS_TESTE, CHAVE_TESTE);
const json = (status: number, corpo: unknown, cabecalhos: Record<string, string> = {}) =>
  new Response(JSON.stringify(corpo), { status, headers: cabecalhos });

describe("enviarPedido", () => {
  it("espera no máximo 15 s", () => {
    expect(TEMPO_LIMITE_MS).toBe(15_000);
  });

  it("tempo esgotado conta como falha (a mesma chave vale para o reenvio)", async () => {
    const buscar = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_, rejeitar) => init?.signal?.addEventListener("abort", () => rejeitar(new DOMException("abortado", "AbortError"))))
    );
    const r = await enviarPedido(CORPO, { tempoLimiteMs: 20, buscar: buscar as unknown as typeof fetch });
    expect(r).toEqual({ tipo: "falha" });
    expect(JSON.parse(String(buscar.mock.calls[0][1]!.body)).chave_idempotencia).toBe(CHAVE_TESTE);
  });

  it("classifica as respostas da rota", async () => {
    const ok = { numero: 1048, itens: [{ valor_centavos: 100 }], subtotal_centavos: 100, total_centavos: 100 };
    const casos: [Response, unknown][] = [
      [json(201, ok), { tipo: "ok", resposta: ok }],
      [json(200, ok), { tipo: "ok", resposta: ok }],
      [json(201, { numero: "x" }), { tipo: "falha" }],
      [json(409, { codigo: "gravacao_desligada" }), { tipo: "desligado" }],
      [json(429, {}, { "Retry-After": "90" }), { tipo: "limite", esperaSegundos: 90 }],
      [json(429, { espera_segundos: 30 }), { tipo: "limite", esperaSegundos: 30 }],
      [json(400, { mensagem: "Confira o e-mail." }), { tipo: "invalido", mensagem: "Confira o e-mail." }],
      [json(413, {}), { tipo: "invalido", mensagem: "O site não aceitou o pedido." }],
      [json(500, {}), { tipo: "falha" }],
      [json(502, {}), { tipo: "falha" }],
    ];
    for (const [res, esperado] of casos) {
      const r = await enviarPedido(CORPO, { buscar: (async () => res) as unknown as typeof fetch });
      expect(r).toEqual(esperado);
    }
  });
});

describe("ambiente (CONTEXT da Netlify fixado no build)", () => {
  it("só 'production' grava de verdade; qualquer outro valor, ou nenhum, é teste", () => {
    expect([pedidoDeTeste("production"), contextoDaGravacao("production")]).toEqual([false, "producao"]);
    for (const c of ["branch-deploy", "deploy-preview", "dev", "", "Production", undefined]) {
      expect([pedidoDeTeste(c), contextoDaGravacao(c)]).toEqual([true, "fora_producao"]);
    }
  });
});

describe("retrato lido do navegador", () => {
  it("recusa o que foi mexido ou é de outra versão", () => {
    expect(lerRetratoDe(null)).toBeNull();
    expect(lerRetratoDe("{")).toBeNull();
    expect(lerRetratoDe(JSON.stringify({ versao: 2, retrato: {} }))).toBeNull();
    expect(lerRetratoDe(JSON.stringify({ versao: 1, retrato: { modo: "registrado", numero: "1", mensagem: "x" } }))).toBeNull();
    const bom = { modo: "registrado", numero: 1048, mensagem: "Olá", formato: "curto", cabe: true, linhas: [], totalCentavos: 0, temBolo: false, prazo: null, pendenteEsvaziar: false };
    expect(lerRetratoDe(JSON.stringify({ versao: 1, retrato: bom }))).toEqual(bom);
  });
});
