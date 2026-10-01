// Decisão OK ou ATENÇÃO do scripts/exclusao/ultima-execucao.mjs, com dados
// fictícios (nenhum banco). Cada caso imprime a saída inteira do script, para
// conferir o texto. Roda nos dois fusos da suíte (UTC e Brasília): o texto
// tem de sair igual nos dois.

import { describe, expect, it } from "vitest";
import { avaliar, montarSaida } from "./decisao.mjs";

// 14/11/2026 15:00 em Brasília.
const AGORA = new Date("2026-11-14T18:00:00Z");
const horasAntes = (h) => new Date(AGORA.getTime() - h * 3600000);

const JOB = { ativo: true, horario: "0 6 * * *" };
const RODADA_OK = { status: "succeeded", inicio: horasAntes(12), mensagem: "1 row" };

function execucao(horas, { origem = "agendada", pedidos = "ok", candidatasPedidos = 0, apagadasPedidos = 0, ip = 4 } = {}) {
  const executadoEm = horasAntes(horas);
  return [
    {
      executadoEm,
      origem,
      tabela: "pedidos",
      prazoMeses: 12,
      prazoHoras: null,
      teto: 150,
      candidatas: candidatasPedidos,
      apagadas: apagadasPedidos,
      status: pedidos,
    },
    { executadoEm, origem, tabela: "pedidos_rate_limit", prazoMeses: null, prazoHoras: 24, teto: null, candidatas: ip, apagadas: ip, status: "ok" },
  ];
}

function rodar(titulo, entrada) {
  const { linhas, veredito } = montarSaida({ agora: AGORA, ...entrada });
  const texto = linhas.join("\n");
  console.log(`\n### ${titulo}\n${texto}\n`);
  // Pedido do Cainan: sem hífen, travessão nem seta no texto impresso.
  expect(texto).not.toMatch(/[-–—→]|->/);
  return { texto, veredito, ultima: linhas[linhas.length - 1] };
}

describe("ultima-execucao: decisão OK ou ATENÇÃO", () => {
  it("OK: job ativo, execução há 12 horas, sem aborto, pg_cron com sucesso", () => {
    const r = rodar("OK", { job: JOB, ultimaRodada: RODADA_OK, registro: execucao(12) });
    expect(r.veredito).toBe("OK");
    expect(r.ultima).toBe("OK");
  });

  it("ATENÇÃO: nenhuma execução registrada", () => {
    const r = rodar("sem execução registrada", { job: JOB, ultimaRodada: null, registro: [] });
    expect(r.veredito).toBe("ATENÇÃO");
    expect(r.ultima).toMatch(/^ATENÇÃO: nenhuma execução registrada para pedidos; nenhuma execução registrada para pedidos_rate_limit\.$/);
  });

  it("ATENÇÃO: última execução há 27 horas", () => {
    const r = rodar("27 horas", { job: JOB, ultimaRodada: { ...RODADA_OK, inicio: horasAntes(27) }, registro: execucao(27) });
    expect(r.veredito).toBe("ATENÇÃO");
    expect(r.ultima).toBe("ATENÇÃO: a última execução foi há 27 horas (limite 26 horas).");
  });

  it("26 horas ainda é OK (o limite é mais de 26)", () => {
    const r = avaliar({ agora: AGORA, job: JOB, ultimaRodada: RODADA_OK, registro: execucao(26) });
    expect(r.veredito).toBe("OK");
  });

  it("ATENÇÃO: o status mais recente de pedidos é abortado por teto", () => {
    const registro = [...execucao(36), ...execucao(12, { pedidos: "abortado_teto", candidatasPedidos: 162 })];
    const r = rodar("aborto ainda não resolvido", { job: JOB, ultimaRodada: RODADA_OK, registro });
    expect(r.veredito).toBe("ATENÇÃO");
    expect(r.ultima).toBe(
      "ATENÇÃO: a execução mais recente de pedidos abortou por teto, em 14/11, e espera liberação manual."
    );
  });

  it("aborto já seguido de execução ok: linha informativa, veredito OK", () => {
    const registro = [
      ...execucao(60, { pedidos: "abortado_teto", candidatasPedidos: 162 }),
      ...execucao(40, { origem: "manual", candidatasPedidos: 162, apagadasPedidos: 162 }),
      ...execucao(12),
    ];
    const r = rodar("aborto resolvido", { job: JOB, ultimaRodada: RODADA_OK, registro });
    expect(r.veredito).toBe("OK");
    expect(r.texto).toContain("pedidos: abortado por teto em 12/11, aborto resolvido em 12/11");
    expect(r.ultima).toBe("OK");
  });

  it("aborto por prazo inválido como status mais recente: ATENÇÃO nas duas tabelas", () => {
    const registro = execucao(12).map((l) => ({ ...l, status: "abortado_prazo_invalido", candidatas: null, apagadas: 0 }));
    const r = rodar("prazo inválido", { job: JOB, ultimaRodada: RODADA_OK, registro });
    expect(r.veredito).toBe("ATENÇÃO");
    expect(r.ultima).toContain("pedidos abortou por prazo inválido");
    expect(r.ultima).toContain("pedidos_rate_limit abortou por prazo inválido");
  });

  it("ATENÇÃO: a última rodada do pg_cron falhou", () => {
    const ultimaRodada = { status: "failed", inicio: horasAntes(12), mensagem: "ERROR:  canceling statement due to lock timeout" };
    const r = rodar("pg_cron falhou", { job: JOB, ultimaRodada, registro: execucao(36) });
    expect(r.veredito).toBe("ATENÇÃO");
    expect(r.ultima).toBe(
      "ATENÇÃO: a última execução foi há 36 horas (limite 26 horas); a última rodada do pg_cron falhou, em 14/11/2026 às 03:00:00."
    );
  });

  it("ATENÇÃO: job inativo", () => {
    const r = rodar("job inativo", { job: { ...JOB, ativo: false }, ultimaRodada: RODADA_OK, registro: execucao(12) });
    expect(r.veredito).toBe("ATENÇÃO");
    expect(r.ultima).toBe("ATENÇÃO: o job exclusao_dados_diaria está inativo.");
  });

  it("ATENÇÃO: job não existe", () => {
    const r = rodar("job não existe", { job: null, ultimaRodada: null, registro: execucao(12) });
    expect(r.veredito).toBe("ATENÇÃO");
    expect(r.ultima).toBe("ATENÇÃO: o job exclusao_dados_diaria não existe.");
  });

  it("histórico em tabela legível", () => {
    const registro = [...execucao(36), ...execucao(12)];
    const historico = [...registro].sort((a, b) => b.executadoEm - a.executadoEm);
    const r = rodar("histórico", { job: JOB, ultimaRodada: RODADA_OK, registro, historico });
    expect(r.texto).toContain("Histórico (4 linhas, mais recentes primeiro):");
    expect(r.texto).toMatch(/14\/11\/2026 às 03:00:00 +agendada +pedidos +12 meses +150/);
  });
});
