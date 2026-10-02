import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { montarCorpo, type CorpoPedido } from "@/lib/pedidos/envio";
import { CHAVE_TESTE, DADOS_TESTE, FIXTURA_VALORES, LINHAS_TESTE } from "@/lib/pedidos/fixtura-teste";

// POST /api/pedidos com o banco simulado (PR confirmacao-e-gravacao). A
// função do banco (public.criar_pedido) é provada de verdade em
// scripts/banco/gravacao-pedidos.mjs, numa transação desfeita; aqui um
// banco na memória faz o mesmo papel: interruptor, chave de idempotência,
// limite por IP (só quando vai gravar) e o gatilho dos totais.

type Linha = { chave: string; numero: number; itens: { quantidade: number; preco_unitario: number }[]; teste: boolean };

const banco = {
  ligada: { producao: true, fora_producao: true } as Record<string, boolean | undefined>,
  pedidos: [] as Linha[],
  tentativas: new Map<string, number>(),
  proximo: 1048,
  erro: null as { code: string; message: string } | null,
};
const rpc = vi.fn(async (fn: string, a: Record<string, unknown>) => {
  // Deixa outra chamada simultânea rodar no meio, como no banco de verdade
  // sem a trava; a trava é a ordem: procura, conta, grava.
  await Promise.resolve();
  if (banco.erro) return { data: null, error: banco.erro };
  if (fn !== "criar_pedido") throw new Error(`função inesperada ${fn}`);
  if (banco.ligada[a.p_contexto as string] !== true) {
    return { data: [{ r_situacao: "desligado", r_numero: null, r_itens: null, r_subtotal: null, r_total: null, r_retry_segundos: null }], error: null };
  }
  const existente = banco.pedidos.find((p) => p.chave === a.p_chave);
  const totais = (itens: Linha["itens"]) => itens.reduce((s, i) => s + i.quantidade * i.preco_unitario, 0).toFixed(2);
  if (existente) {
    return { data: [{ r_situacao: "existente", r_numero: existente.numero, r_itens: existente.itens, r_subtotal: totais(existente.itens), r_total: totais(existente.itens), r_retry_segundos: null }], error: null };
  }
  const ip = a.p_ip as string;
  const n = (banco.tentativas.get(ip) ?? 0) + 1;
  banco.tentativas.set(ip, n);
  if (n > (a.p_limite as number)) {
    return { data: [{ r_situacao: "bloqueado", r_numero: null, r_itens: null, r_subtotal: null, r_total: null, r_retry_segundos: 1234 }], error: null };
  }
  const itens = (a.p_pedido as { itens: Linha["itens"] }).itens;
  const linha = { chave: a.p_chave as string, numero: banco.proximo++, itens, teste: a.p_teste as boolean };
  banco.pedidos.push(linha);
  return { data: [{ r_situacao: "criado", r_numero: linha.numero, r_itens: itens, r_subtotal: totais(itens), r_total: totais(itens), r_retry_segundos: null }], error: null };
});

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));

const { POST } = await import("./route");

// Relógio: 29/09/2026 às 21h30 de Brasília (já 30/09 em UTC).
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-30T00:30:00Z"));
});
afterAll(() => vi.useRealTimers());

let chaves = 0;
function corpo(sobrescrever: Partial<CorpoPedido> = {}): CorpoPedido {
  chaves += 1;
  const chave = `${String(chaves).padStart(8, "0")}-0000-4000-8000-000000000000`;
  return { ...montarCorpo(DADOS_TESTE, LINHAS_TESTE, chave), ...sobrescrever };
}

function requisicao(c: unknown, cabecalhos: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/pedidos", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-nf-client-connection-ip": "200.1.2.3", ...cabecalhos },
    body: typeof c === "string" ? c : JSON.stringify(c),
  });
}

const logs: unknown[][] = [];
beforeEach(() => {
  rpc.mockClear();
  banco.ligada = { producao: true, fora_producao: true };
  banco.pedidos = [];
  banco.tentativas = new Map();
  banco.proximo = 1048;
  banco.erro = null;
  logs.length = 0;
  for (const nivel of ["log", "info", "warn", "error"] as const) {
    vi.spyOn(console, nivel).mockImplementation((...args: unknown[]) => void logs.push(args));
  }
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/pedidos: gravação", () => {
  it("valida, chama o banco uma vez só e devolve número, valor de cada linha e totais (sem dado pessoal)", async () => {
    const res = await POST(requisicao(corpo()));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json).toEqual({
      numero: 1048,
      itens: FIXTURA_VALORES.linhas.map((l) => ({ valor_centavos: l.valorCentavos })),
      subtotal_centavos: FIXTURA_VALORES.totalCentavos,
      total_centavos: FIXTURA_VALORES.totalCentavos,
    });
    expect(JSON.stringify(json)).not.toContain("Juliana");
    expect(rpc).toHaveBeenCalledTimes(1);
    const args = rpc.mock.calls[0][1];
    expect(args).toMatchObject({ p_ip: "200.1.2.3", p_janela_segundos: 3600, p_limite: 8 });
    // O pedido vai sem valor de entrega, status nem teste no corpo.
    expect(args.p_pedido).not.toHaveProperty("valor_entrega");
    expect(args.p_pedido).not.toHaveProperty("status");
    expect(args.p_pedido).not.toHaveProperty("teste");
  });

  it("nenhuma chamada ao banco antes de a validação passar (inválido, JSON quebrado, corpo grande demais)", async () => {
    const r1 = await POST(requisicao(corpo({ whatsapp: "123" })));
    const r2 = await POST(requisicao("{nao é json"));
    const r3 = await POST(requisicao({ ...corpo(), observacoes: "x".repeat(33 * 1024) }));
    const r4 = await POST(requisicao({ ...corpo(), campo_estranho: 1 }));
    expect([r1.status, r2.status, r3.status, r4.status]).toEqual([400, 400, 413, 400]);
    expect((await r1.json()).codigo).toBe("invalido");
    expect((await r3.json()).codigo).toBe("grande_demais");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("tentativa inválida não conta no limite por IP", async () => {
    for (let i = 0; i < 20; i++) await POST(requisicao(corpo({ itens: [] })));
    expect(banco.tentativas.size).toBe(0);
    expect((await POST(requisicao(corpo()))).status).toBe(201);
  });

  it("total do navegador diferente do recalculado: grava o recalculado e registra aviso sem dado pessoal", async () => {
    const res = await POST(requisicao(corpo({ total_navegador_centavos: 1 })));
    expect(res.status).toBe(201);
    expect((await res.json()).total_centavos).toBe(FIXTURA_VALORES.totalCentavos);
    const aviso = logs.find((l) => String(l[0]).includes("total do navegador"));
    expect(aviso?.[1]).toEqual({ numero: 1048, diferenca_centavos: 1 - FIXTURA_VALORES.totalCentavos });
  });
});

describe("POST /api/pedidos: idempotência", () => {
  it("mesma chave devolve o mesmo número (200) e não grava outro, mesmo com corpo diferente", async () => {
    const c = corpo();
    const r1 = await POST(requisicao(c));
    const r2 = await POST(requisicao({ ...c, observacoes: "outra coisa", itens: c.itens.slice(0, 1) }));
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(200);
    expect((await r2.json()).numero).toBe((await r1.json()).numero);
    expect(banco.pedidos).toHaveLength(1);
  });

  it("duas chamadas simultâneas com a mesma chave geram um único pedido", async () => {
    const c = corpo();
    const [a, b] = await Promise.all([POST(requisicao(c)), POST(requisicao(c))]);
    const numeros = [(await a.json()).numero, (await b.json()).numero];
    expect(numeros[0]).toBe(numeros[1]);
    expect(banco.pedidos).toHaveLength(1);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
  });

  it("reenvio com chave conhecida não conta no limite por IP", async () => {
    const c = corpo();
    for (let i = 0; i < 10; i++) expect((await POST(requisicao(c))).ok).toBe(true);
    expect(banco.tentativas.get("200.1.2.3")).toBe(1);
  });
});

describe("POST /api/pedidos: limite, interruptor e erros", () => {
  it("no teto do IP devolve 429 com Retry-After e não grava", async () => {
    for (let i = 0; i < 8; i++) expect((await POST(requisicao(corpo()))).status).toBe(201);
    const res = await POST(requisicao(corpo()));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("1234");
    expect(await res.json()).toMatchObject({ codigo: "limite", espera_segundos: 1234 });
    expect(banco.pedidos).toHaveLength(8);
  });

  it("interruptor desligado: 409 e nada gravado", async () => {
    banco.ligada.fora_producao = false;
    const res = await POST(requisicao(corpo()));
    expect(res.status).toBe(409);
    expect((await res.json()).codigo).toBe("gravacao_desligada");
    expect(banco.pedidos).toHaveLength(0);
    expect(banco.tentativas.size).toBe(0);
  });

  it("linha do interruptor ausente conta como desligado", async () => {
    banco.ligada = {};
    expect((await POST(requisicao(corpo()))).status).toBe(409);
    expect(banco.pedidos).toHaveLength(0);
  });

  it("erro do banco: 500 com mensagem segura e log só com o código", async () => {
    banco.erro = { code: "23514", message: 'new row violates check constraint. Failing row contains (Juliana Ribeiro Teste, (41) 99712-4408, ...)' };
    const res = await POST(requisicao(corpo()));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.codigo).toBe("erro");
    expect(JSON.stringify(json)).not.toContain("Juliana");
    expect(logs).toContainEqual(["pedidos: falha ao gravar", { codigo: "23514" }]);
  });

  it("nenhum log da rota contém corpo de pedido, dado pessoal nem IP", async () => {
    await POST(requisicao(corpo()));
    await POST(requisicao(corpo({ total_navegador_centavos: 5 })));
    await POST(requisicao(corpo({ whatsapp: "1" })));
    banco.erro = { code: "XX000", message: "Failing row contains (Juliana Ribeiro Teste)" };
    await POST(requisicao(corpo()));
    const tudo = JSON.stringify(logs);
    for (const pessoal of ["Juliana", "99712", "juliana.teste", "Cerejeiras", "salão", "200.1.2.3", "Brigadeiro"]) {
      expect(tudo).not.toContain(pessoal);
    }
  });
});

describe("POST /api/pedidos: teste e interruptor pelo ambiente (CONTEXT embutido no build)", () => {
  it("CONTEXT=production grava teste = falso e usa o interruptor da produção", async () => {
    vi.stubEnv("CONTEXTO_NETLIFY", "production");
    await POST(requisicao(corpo()));
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_teste: false, p_contexto: "producao" });
    expect(banco.pedidos[0].teste).toBe(false);
  });

  for (const contexto of ["branch-deploy", "deploy-preview", "dev", "", undefined]) {
    it(`CONTEXT=${contexto === undefined ? "(ausente)" : JSON.stringify(contexto)} grava teste = verdadeiro e usa o interruptor dos demais ambientes`, async () => {
      vi.stubEnv("CONTEXTO_NETLIFY", contexto);
      await POST(requisicao(corpo()));
      expect(rpc.mock.calls[0][1]).toMatchObject({ p_teste: true, p_contexto: "fora_producao" });
      expect(banco.pedidos[0].teste).toBe(true);
    });
  }

  it("produção com o interruptor da produção desligado: 409, mesmo com o dos demais ligado", async () => {
    vi.stubEnv("CONTEXTO_NETLIFY", "production");
    banco.ligada = { producao: false, fora_producao: true };
    expect((await POST(requisicao(corpo()))).status).toBe(409);
  });
});

describe("POST /api/pedidos: IP", () => {
  it("em produção usa o IP da Netlify e ignora X-Forwarded-For forjado", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await POST(requisicao(corpo(), { "x-forwarded-for": "203.0.113.1" }));
    expect(rpc.mock.calls.at(-1)![1].p_ip).toBe("200.1.2.3");
    await POST(
      new NextRequest("http://localhost/api/pedidos", {
        method: "POST",
        headers: { "x-forwarded-for": "203.0.113.2" },
        body: JSON.stringify(corpo()),
      })
    );
    expect(rpc.mock.calls.at(-1)![1].p_ip).toBe("unknown");
  });

  it("fora de produção aceita X-Forwarded-For (dev local sem a Netlify)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await POST(
      new NextRequest("http://localhost/api/pedidos", {
        method: "POST",
        headers: { "x-forwarded-for": "10.0.0.5, 10.0.0.1" },
        body: JSON.stringify(corpo()),
      })
    );
    expect(rpc.mock.calls.at(-1)![1].p_ip).toBe("10.0.0.5");
  });
});

// Chave de teste fixa usada em outros testes: formato aceito.
it("a chave de teste compartilhada tem o formato de uuid", () => {
  expect(CHAVE_TESTE).toMatch(/^[0-9a-f-]{36}$/);
});
