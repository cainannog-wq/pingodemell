import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { LinhaKit } from "@/lib/carrinho/regras";
import { BEIJINHO, BRIGADEIRO, CAJUZINHO, NINHO, PRODUTO, SUCO, linhasDoExemplo } from "@/lib/kit/fixtura";
import { configDoExemplo } from "@/lib/kit/fixtura";
import { montarRetrato } from "@/lib/kit/texto";
import { montarCorpo } from "@/lib/pedidos/envio";
import { CHAVE_TESTE, DADOS_TESTE } from "@/lib/pedidos/fixtura-teste";

// POST /api/pedidos com linha de kit por pessoa (PR 3+4 do Kit Festa por
// pessoa), banco simulado: a conferência da composição contra a configuração
// do kit (lida das tabelas kit_*, em cache de 5 minutos no servidor) e os
// limites que só valem com kit. O banco de verdade é de
// scripts/banco/gravacao-pedidos.mjs (gatilho dos totais nos 31 tamanhos).

const chamadas = { rpc: [] as Record<string, unknown>[], leituras: [] as string[] };
const leitura = { erro: null as { code: string } | null };

const linhas = linhasDoExemplo();
const TABELAS: Record<string, unknown[]> = {
  kit_tamanhos: linhas.tamanhos.map((t) => ({ ...t, produto_id: PRODUTO })),
  kit_grupos: linhas.grupos.map((g) => ({ ...g, produto_id: PRODUTO })),
  kit_lista_itens: linhas.itens,
  kit_quantidades: linhas.quantidades.map((q) => ({ ...q, produto_id: PRODUTO })),
};

const rpc = vi.fn(async (fn: string, a: Record<string, unknown>) => {
  if (fn !== "criar_pedido") throw new Error(`função inesperada ${fn}`);
  chamadas.rpc.push(a);
  const itens = (a.p_pedido as { itens: { quantidade: number; preco_unitario: number }[] }).itens;
  const total = itens.reduce((s, i) => s + i.quantidade * i.preco_unitario, 0).toFixed(2);
  return { data: [{ r_situacao: "criado", r_numero: 1060, r_itens: itens, r_subtotal: total, r_total: total, r_retry_segundos: null }], error: null };
});
const from = vi.fn((tabela: string) => {
  chamadas.leituras.push(tabela);
  return {
    select: () =>
      Promise.resolve(
        leitura.erro ? { data: null, error: leitura.erro } : { data: TABELAS[tabela] ?? [], error: null }
      ),
  };
});
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc, from }) }));

const { POST } = await import("./route");

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-30T00:30:00Z"));
});
afterAll(() => vi.useRealTimers());

const config = configDoExemplo();
function kit(pessoas: number, escolhas: LinhaKit["escolhas"], produtoId = PRODUTO, id = "k1", formato?: "redondo" | "quadrado"): LinhaKit {
  return {
    id,
    tipo: "kit",
    produtoId,
    slug: "kit-festa",
    nome: "Kit Festa Teste",
    preco: 22,
    observacao: null,
    quantidade: pessoas,
    unidade_venda: "a pessoa",
    escolhas,
    retrato: montarRetrato(config, pessoas, escolhas, formato),
    ...(formato ? { formato } : {}),
  };
}
const CERTO: LinhaKit["escolhas"] = { bolo: [[NINHO, 1]], doces: [[BRIGADEIRO, 10], [BEIJINHO, 10]], bebida: [[SUCO, 2]] };

function requisicao(c: unknown) {
  return new NextRequest("http://localhost/api/pedidos", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-nf-client-connection-ip": "200.1.2.3" },
    body: typeof c === "string" ? c : JSON.stringify(c),
  });
}
const pedido = (linhasKit: LinhaKit[], chave = CHAVE_TESTE) => montarCorpo(DADOS_TESTE, linhasKit, chave);

const logs: unknown[][] = [];
beforeEach(() => {
  chamadas.rpc.length = 0;
  chamadas.leituras.length = 0;
  rpc.mockClear();
  from.mockClear();
  leitura.erro = null;
  logs.length = 0;
  for (const nivel of ["log", "info", "warn", "error"] as const) {
    vi.spyOn(console, nivel).mockImplementation((...args: unknown[]) => void logs.push(args));
  }
});
afterEach(() => vi.restoreAllMocks());

describe("kit no pedido", () => {
  it("composição certa: grava, com o texto da composição em variacao e os pares de ids", async () => {
    const res = await POST(requisicao(pedido([kit(10, CERTO)])));
    expect(res.status).toBe(201);
    const item = (chamadas.rpc[0].p_pedido as { itens: Record<string, unknown>[] }).itens[0];
    expect(item.tipo).toBe("kit");
    expect(item.quantidade).toBe(10);
    expect(item.variacao).toBe(
      ["Bolo: 1 kg", "Recheio do bolo: Ninho com morango", "Doces: Brigadeiro 10, Beijinho 10", "Bebida: 2 Suco de uva 1L", "Descartáveis: 10 pratos e copos"].join("\n")
    );
    expect(item.escolhas).toEqual(CERTO);
    // Uma leitura de cada tabela do kit, e só.
    expect([...chamadas.leituras].sort()).toEqual(["kit_grupos", "kit_lista_itens", "kit_quantidades", "kit_tamanhos"]);
  });

  it("formato do bolo: vai na primeira linha da composição e no item; sem formato, como antes", async () => {
    const res = await POST(requisicao(pedido([kit(10, CERTO, PRODUTO, "k1", "quadrado")])));
    expect(res.status).toBe(201);
    const item = (chamadas.rpc[0].p_pedido as { itens: Record<string, unknown>[] }).itens[0];
    expect(String(item.variacao).split("\n")[0]).toBe("Bolo: 1 kg, quadrado");
    expect(item.formato).toBe("quadrado");
  });

  it("formato do bolo inválido é recusado e nada grava", async () => {
    const corpo = pedido([kit(10, CERTO, PRODUTO, "k1", "quadrado")]) as unknown as { itens: Record<string, unknown>[] };
    corpo.itens[0].formato = "triangular";
    const res = await POST(requisicao(corpo));
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("composição que não fecha (soma, passo, quantidade, opção repetida) é recusada e nada grava", async () => {
    const ruins: LinhaKit["escolhas"][] = [
      { ...CERTO, doces: [[BRIGADEIRO, 10]] },
      { ...CERTO, doces: [[BRIGADEIRO, 15], [BEIJINHO, 5]] },
      { ...CERTO, bebida: [[SUCO, 3]] },
      { ...CERTO, bolo: [] },
    ];
    for (const e of ruins) {
      const res = await POST(requisicao(pedido([kit(10, e)])));
      expect(res.status).toBe(400);
      expect((await res.json()).mensagem).toMatch(/composição de um kit/);
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("tamanho que o kit não tem é recusado", async () => {
    expect((await POST(requisicao(pedido([kit(11, CERTO)])))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("id de opção desconhecido: aceito, gravado com 'opção não encontrada' e aviso no log", async () => {
    const estranho = "ffffffff-0000-4000-8000-000000000009";
    const e = { ...CERTO, doces: [[estranho, 10], [BEIJINHO, 10]] as [string, number][] };
    const res = await POST(requisicao(pedido([kit(10, e)])));
    expect(res.status).toBe(201);
    const item = (chamadas.rpc[0].p_pedido as { itens: { variacao: string }[] }).itens[0];
    expect(item.variacao).toContain("Doces: opção não encontrada 10, Beijinho 10");
    expect(JSON.stringify(logs)).toContain("composição não conferida");
    expect(JSON.stringify(logs)).not.toContain(estranho);
  });

  it("produto que não está na configuração: aceito sem conferência, com aviso", async () => {
    const outro = "99999999-9999-4999-8999-999999999999";
    const res = await POST(requisicao(pedido([kit(10, CERTO, outro)])));
    expect(res.status).toBe(201);
    const item = (chamadas.rpc[0].p_pedido as { itens: { variacao: string }[] }).itens[0];
    expect(item.variacao).toBe("Composição não conferida pelo site");
    expect(logs.length).toBeGreaterThan(0);
  });

  it("falha da leitura da configuração: 500 retentável, nada grava, nada vaza no log", async () => {
    leitura.erro = { code: "XX000" };
    const res = await POST(requisicao(pedido([kit(10, CERTO)])));
    expect(res.status).toBe(500);
    expect(rpc).not.toHaveBeenCalled();
    const log = JSON.stringify(logs);
    expect(log).toContain("configuração dos kits");
    expect(log).not.toContain(DADOS_TESTE.nome);
  });

  it("pedido sem kit nunca lê as tabelas do kit", async () => {
    const res = await POST(requisicao(pedido([])));
    expect(res.status).toBe(400); // sem itens: forma inválida, sem banco
    expect(from).not.toHaveBeenCalled();
  });

  it("mais de 5 kits: recusado com o texto do limite, sem consultar o banco", async () => {
    const seis = Array.from({ length: 6 }, (_, i) => kit(10, CERTO, PRODUTO, `k${i}`));
    const res = await POST(requisicao(pedido(seis)));
    expect(res.status).toBe(400);
    expect((await res.json()).mensagem).toBe("Cada pedido aceita até 5 kits. Para mais, fale com a gente pelo WhatsApp.");
    expect(from).not.toHaveBeenCalled();
    const cinco = Array.from({ length: 5 }, (_, i) => kit(10, CERTO, PRODUTO, `k${i}`));
    expect((await POST(requisicao(pedido(cinco)))).status).toBe(201);
  });

  it("corpo acima de 32 KB: só passa com kit; acima de 64 KB, nunca", async () => {
    const grande = { ...pedido([kit(10, CERTO)]), observacoes: "x".repeat(40 * 1024) };
    // Com kit, 40 KB de corpo passa do limite de 500 caracteres das observações
    // (400 de validação), mas NÃO é 413: o corpo ainda cabe nos 64 KB.
    expect((await POST(requisicao(grande))).status).toBe(400);
    const semKit = { ...pedido([]), observacoes: "x".repeat(40 * 1024) };
    expect((await POST(requisicao(semKit))).status).toBe(413);
    const enorme = { ...pedido([kit(10, CERTO)]), observacoes: "x".repeat(70 * 1024) };
    expect((await POST(requisicao(enorme))).status).toBe(413);
    void CAJUZINHO;
  });
});
