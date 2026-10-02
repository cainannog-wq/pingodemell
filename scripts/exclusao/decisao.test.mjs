// Decisão OK ou ATENÇÃO do scripts/exclusao/ultima-execucao.mjs, com dados
// fictícios (nenhum banco). Cada caso imprime a saída inteira do script, para
// conferir o texto. Roda nos dois fusos da suíte (UTC e Brasília): o texto
// tem de sair igual nos dois.

import { describe, expect, it } from "vitest";
import { avaliar, montarSaida, montarSimulacao } from "./decisao.mjs";

// 14/11/2026 15:00 em Brasília.
const AGORA = new Date("2026-11-14T18:00:00Z");
const horasAntes = (h) => new Date(AGORA.getTime() - h * 3600000);

const JOB = { ativo: true, horario: "0 6 * * *" };
const RODADA_OK = { status: "succeeded", inicio: horasAntes(12), mensagem: "1 row" };
const RODADA_FALHOU = { status: "failed", inicio: horasAntes(12), mensagem: "ERROR:  canceling statement due to lock timeout" };

// Comandos literais esperados (opções com dois hífens).
const SIMULAR = "node scripts/exclusao/executar-manual.mjs";
const executar = (teto) => `node scripts/exclusao/executar-manual.mjs --executar --teto ${teto}`;

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
  return conferir(titulo, linhas, veredito);
}

function conferir(titulo, linhas, veredito) {
  const texto = linhas.join("\n");
  console.log(`\n### ${titulo}\n${texto}\n`);
  // Pedido do Cainan: sem hífen, travessão nem seta no texto impresso. Os
  // comandos são literais (opções com dois hífens) e ficam de fora.
  const comandos = linhas.filter((l) => l.startsWith("node scripts/"));
  const resto = linhas.filter((l) => !l.startsWith("node scripts/")).join("\n");
  expect(resto).not.toMatch(/[-–—→]|->/);
  return { texto, veredito, comandos, ultima: linhas[linhas.length - 1] };
}

describe("ultima-execucao: decisão OK ou ATENÇÃO", () => {
  it("OK: job ativo, execução há 12 horas, sem aborto, pg_cron com sucesso", () => {
    const r = rodar("OK", { job: JOB, ultimaRodada: RODADA_OK, registro: execucao(12) });
    expect(r.veredito).toBe("OK");
    expect(r.ultima).toBe("OK");
    expect(r.comandos).toEqual([]);
  });

  it("job criado, ainda sem execução: ATENÇÃO que diz ser a espera da primeira rodada, sem comando", () => {
    const r = rodar("job sem execução ainda", { job: JOB, ultimaRodada: null, registro: [] });
    expect(r.veredito).toBe("ATENÇÃO");
    expect(r.ultima).toBe(
      "ATENÇÃO: job criado, ainda sem execução: espera da primeira rodada, às 06:00 UTC (03:00 de Brasília). Não é falha; rode de novo depois desse horário."
    );
    expect(r.texto).not.toContain("nenhuma execução registrada para");
    expect(r.comandos).toEqual([]);
  });

  it("ATENÇÃO: execução ausente (o pg_cron rodou e não há registro): só o comando da simulação", () => {
    const r = rodar("execução ausente", { job: JOB, ultimaRodada: RODADA_FALHOU, registro: [] });
    expect(r.veredito).toBe("ATENÇÃO");
    expect(r.ultima).toBe(
      "ATENÇÃO: nenhuma execução registrada para pedidos; nenhuma execução registrada para pedidos_rate_limit; a última rodada do pg_cron falhou, em 14/11/2026 às 03:00:00."
    );
    expect(r.comandos).toEqual([SIMULAR]);
  });

  it("ATENÇÃO: última execução há 27 horas: só o comando da simulação", () => {
    const r = rodar("27 horas", {
      job: JOB,
      ultimaRodada: { ...RODADA_OK, inicio: horasAntes(27) },
      registro: execucao(27),
    });
    expect(r.veredito).toBe("ATENÇÃO");
    expect(r.ultima).toBe("ATENÇÃO: a última execução foi há 27 horas (limite 26 horas).");
    expect(r.comandos).toEqual([SIMULAR]);
  });

  it("26 horas ainda é OK (o limite é mais de 26)", () => {
    const r = avaliar({ agora: AGORA, job: JOB, ultimaRodada: RODADA_OK, registro: execucao(26) });
    expect(r.veredito).toBe("OK");
    expect(r.liberacao).toBe(false);
  });

  it("ATENÇÃO: aborto de teto ainda não resolvido: só o comando da simulação, nunca o de apagar", () => {
    const registro = [...execucao(36), ...execucao(12, { pedidos: "abortado_teto", candidatasPedidos: 162 })];
    const r = rodar("aborto de teto", { job: JOB, ultimaRodada: RODADA_OK, registro });
    expect(r.veredito).toBe("ATENÇÃO");
    expect(r.ultima).toBe("ATENÇÃO: a execução mais recente de pedidos abortou por teto, em 14/11, e espera liberação manual.");
    expect(r.texto).toContain("Liberação manual: rode a simulação. Ela mostra o que seria apagado e, no fim, o comando para apagar, com o teto da contagem dela:");
    expect(r.comandos).toEqual([SIMULAR]);
    expect(r.texto).not.toContain("--executar");
  });

  it("aborto já seguido de execução ok: linha informativa, veredito OK, sem comando", () => {
    const registro = [
      ...execucao(60, { pedidos: "abortado_teto", candidatasPedidos: 162 }),
      ...execucao(40, { origem: "manual", candidatasPedidos: 162, apagadasPedidos: 162 }),
      ...execucao(12),
    ];
    const r = rodar("aborto resolvido", { job: JOB, ultimaRodada: RODADA_OK, registro });
    expect(r.veredito).toBe("OK");
    expect(r.texto).toContain("pedidos: abortado por teto em 12/11, aborto resolvido em 12/11");
    expect(r.ultima).toBe("OK");
    expect(r.comandos).toEqual([]);
  });

  it("aborto por prazo inválido como status mais recente: ATENÇÃO nas duas tabelas, sem comando", () => {
    const registro = execucao(12).map((l) => ({ ...l, status: "abortado_prazo_invalido", candidatas: null, apagadas: 0 }));
    const r = rodar("prazo inválido", { job: JOB, ultimaRodada: RODADA_OK, registro });
    expect(r.veredito).toBe("ATENÇÃO");
    expect(r.ultima).toContain("pedidos abortou por prazo inválido");
    expect(r.ultima).toContain("pedidos_rate_limit abortou por prazo inválido");
    // Liberar manualmente não resolve: os prazos vêm das constantes do banco.
    expect(r.comandos).toEqual([]);
  });

  it("ATENÇÃO: a última rodada do pg_cron falhou", () => {
    const r = rodar("pg_cron falhou", { job: JOB, ultimaRodada: RODADA_FALHOU, registro: execucao(36) });
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

function tabelas({ pedidos = 0, ip = 0, abortaria = false } = {}) {
  return [
    {
      tabela: "pedidos",
      candidatas: pedidos,
      diaMaisAntigo: pedidos ? "2025-09-02" : null,
      diaMaisRecente: pedidos ? "2025-11-13" : null,
      agendadaAbortaria: abortaria,
      prazoMeses: 12,
      prazoHoras: 8760,
      teto: 150,
    },
    {
      tabela: "pedidos_rate_limit",
      candidatas: ip,
      diaMaisAntigo: ip ? "2026-11-10" : null,
      diaMaisRecente: ip ? "2026-11-13" : null,
      agendadaAbortaria: false,
      prazoMeses: 0,
      prazoHoras: 24,
      teto: null,
    },
  ];
}

describe("executar-manual: saída da simulação", () => {
  const simular = (titulo, entrada) => {
    const { linhas, comando } = montarSimulacao({ agora: AGORA, tabelas: tabelas(entrada) });
    return { ...conferir(titulo, linhas, null), comando };
  };

  it("com pedidos candidatos: o comando de apagar aparece só no fim, com o teto da contagem que a simulação acabou de fazer", () => {
    const r = simular("simulação com 162 pedidos", { pedidos: 162, ip: 7, abortaria: true });
    expect(r.texto).toContain("pedidos: 162 seriam apagados. Pedidos criados de 02/09/2025 a 13/11/2025 (dias de Brasília).");
    expect(r.texto).toContain("a rotina agendada ABORTARIA e esperaria liberação manual.");
    expect(r.texto).toContain("pedidos_rate_limit: 7 seriam apagadas. Janelas iniciadas de 10/11/2026 a 13/11/2026");
    expect(r.comandos).toEqual([executar(162)]);
    expect(r.ultima).toBe(executar(162));
    expect(r.comando).toBe(executar(162));
  });

  it("zero candidatas: diz que não há nada a apagar e não imprime comando", () => {
    const r = simular("simulação sem nada", { pedidos: 0, ip: 0 });
    expect(r.ultima).toBe("Nada a apagar: não há o que liberar manualmente.");
    expect(r.comandos).toEqual([]);
    expect(r.comando).toBeNull();
  });

  it("zero pedidos e linhas de IP: sem comando, as linhas de IP saem na rotina agendada", () => {
    const r = simular("simulação só com IP", { pedidos: 0, ip: 3 });
    expect(r.texto).toContain("pedidos_rate_limit: 3 seriam apagadas.");
    expect(r.ultima).toBe(
      "Nenhum pedido a apagar: não há o que liberar manualmente. As linhas de IP saem sozinhas na próxima rotina agendada."
    );
    expect(r.comandos).toEqual([]);
    expect(r.comando).toBeNull();
  });
});
