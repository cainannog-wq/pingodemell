import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// POST /api/pedidos com o banco simulado: a chave de serviço (createAdminClient)
// é a única que grava pedido, depois de conferir o limite por IP. Cobre a
// parte da rota que os scripts antigos test-rate-limit-*.mjs provavam
// gravando pedidos de verdade; a parte de banco (6ª tentativa bloqueada,
// janela que recomeça) está em scripts/banco/limite-pedidos.mjs.

const rpc = vi.fn();
const inserts: unknown[] = [];
let erroInsert: { message: string } | null = null;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: (fn: string, args: unknown) => rpc(fn, args),
    from: (tabela: string) => ({
      insert: (linha: unknown) => {
        inserts.push({ tabela, linha });
        return {
          select: () => ({
            single: async () =>
              erroInsert ? { data: null, error: erroInsert } : { data: { id: "id-novo", numero: 1048 }, error: null },
          }),
        };
      },
    }),
  }),
}));

const { POST } = await import("./route");

function pedido(sobrescrever: Record<string, unknown> = {}) {
  return {
    cliente_nome: "Cliente",
    cliente_whatsapp: "(41) 99999-0000",
    modo_entrega: "retirada",
    data_hora_entrega: "2026-10-01T15:00:00.000Z",
    forma_pagamento: "PIX",
    itens: [{ nome: "Bolo", quantidade: 2, preco_unitario: 50 }],
    ...sobrescrever,
  };
}

function requisicao(corpo: unknown, cabecalhos: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/pedidos", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...cabecalhos },
    body: JSON.stringify(corpo),
  });
}

const permitido = (sim: boolean) => rpc.mockResolvedValue({ data: [{ permitido: sim, contagem: 1 }], error: null });
const ipConferido = () => (rpc.mock.calls.at(-1)?.[1] as { p_ip: string }).p_ip;

beforeEach(() => {
  rpc.mockReset();
  inserts.length = 0;
  erroInsert = null;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/pedidos", () => {
  it("confere o limite com a janela e o limite da rota, pela chave de serviço, antes de gravar", async () => {
    permitido(true);
    const res = await POST(requisicao(pedido(), { "x-nf-client-connection-ip": "200.1.2.3" }));

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "id-novo", numero: 1048 });
    expect(rpc).toHaveBeenCalledWith("registrar_tentativa_pedido", {
      p_ip: "200.1.2.3",
      p_janela_segundos: 600,
      p_limite: 5,
    });
    expect(inserts).toHaveLength(1);
  });

  it("grava com totais recalculados no servidor, ignorando status e totais enviados pelo cliente", async () => {
    permitido(true);
    await POST(requisicao(pedido({ subtotal: 0.01, total: 0.01, status: "entregue", valor_entrega: 10 })));

    const { tabela, linha } = inserts[0] as { tabela: string; linha: Record<string, unknown> };
    expect(tabela).toBe("pedidos");
    expect(linha).toMatchObject({ subtotal: 100, valor_entrega: 10, total: 110 });
    expect(linha).not.toHaveProperty("status");
  });

  it("devolve 429 e não grava quando o IP estourou o limite", async () => {
    permitido(false);
    const res = await POST(requisicao(pedido(), { "x-nf-client-connection-ip": "200.1.2.3" }));

    expect(res.status).toBe(429);
    expect(inserts).toHaveLength(0);
  });

  it("em produção usa o IP da Netlify e ignora X-Forwarded-For forjado", async () => {
    vi.stubEnv("NODE_ENV", "production");
    permitido(true);

    await POST(requisicao(pedido(), { "x-nf-client-connection-ip": "200.1.2.3", "x-forwarded-for": "203.0.113.1" }));
    expect(ipConferido()).toBe("200.1.2.3");

    await POST(requisicao(pedido(), { "x-forwarded-for": "203.0.113.2" }));
    expect(ipConferido()).toBe("unknown");
  });

  it("fora de produção aceita X-Forwarded-For como alternativa (dev local sem a Netlify)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    permitido(true);

    await POST(requisicao(pedido(), { "x-forwarded-for": "10.0.0.5, 10.0.0.1" }));
    expect(ipConferido()).toBe("10.0.0.5");
  });

  it("conta a tentativa mesmo com pedido inválido e devolve 400 sem gravar", async () => {
    permitido(true);
    const res = await POST(requisicao(pedido({ itens: [] })));

    expect(res.status).toBe(400);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(inserts).toHaveLength(0);
  });

  it("devolve 500 e não grava se a conferência do limite falhar", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "permission denied" } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(requisicao(pedido()));

    expect(res.status).toBe(500);
    expect(inserts).toHaveLength(0);
  });

  it("devolve 500 se a gravação falhar", async () => {
    permitido(true);
    erroInsert = { message: "falhou" };
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(requisicao(pedido()));

    expect(res.status).toBe(500);
  });
});
