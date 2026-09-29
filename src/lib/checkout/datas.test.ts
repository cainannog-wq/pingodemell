import { describe, expect, it } from "vitest";
import { hojeBrasilia, somarDias } from "@/lib/tempo/brasilia";
import {
  dataPermitida,
  horariosDoDia,
  itemMaisDemorado,
  LIMITE_DIAS_A_FRENTE,
  motivoBloqueio,
  prazoCurto,
  primeiraDataPermitida,
  prontoEm,
  quintaDoFimDeSemana,
  rotuloHorario,
} from "./datas";

// Calendário de referência (outubro de 2026):
//   ter 29/09 · qua 30/09 · qui 01 · sex 02 · sáb 03 · dom 04 · seg 05 ·
//   ter 06 · qua 07 · qui 08 · sex 09 · sáb 10 · dom 11 · seg 12
const SEM_DIAS_OFF = new Set<string>();

describe("antecedência: dia de semana pede 1 dia", () => {
  it("hoje e antes ficam bloqueados; amanhã (dia de semana) vale", () => {
    expect(motivoBloqueio("2026-09-29", "2026-09-29", SEM_DIAS_OFF)).toBe("antecedencia");
    expect(motivoBloqueio("2026-09-28", "2026-09-29", SEM_DIAS_OFF)).toBe("antecedencia");
    expect(motivoBloqueio("2026-09-30", "2026-09-29", SEM_DIAS_OFF)).toBeNull();
    expect(primeiraDataPermitida("2026-09-29", SEM_DIAS_OFF)).toBe("2026-09-30");
  });

  it("pedido na segunda vale para terça", () => {
    expect(primeiraDataPermitida("2026-10-05", SEM_DIAS_OFF)).toBe("2026-10-06");
  });

  it("pedido na quarta vale para quinta", () => {
    expect(primeiraDataPermitida("2026-09-30", SEM_DIAS_OFF)).toBe("2026-10-01");
  });
});

describe("fim de semana: pedido até quinta-feira daquela semana", () => {
  it("quinta anterior ao sábado e ao domingo", () => {
    expect(quintaDoFimDeSemana("2026-10-03")).toBe("2026-10-01");
    expect(quintaDoFimDeSemana("2026-10-04")).toBe("2026-10-01");
  });

  it("pedido na terça ou na quinta: sábado e domingo da semana valem", () => {
    for (const hoje of ["2026-09-29", "2026-10-01"]) {
      expect(motivoBloqueio("2026-10-03", hoje, SEM_DIAS_OFF)).toBeNull();
      expect(motivoBloqueio("2026-10-04", hoje, SEM_DIAS_OFF)).toBeNull();
    }
  });

  it("pedido na sexta: sábado e domingo bloqueados, próxima data é terça (não dá para pedir na sexta para sábado)", () => {
    expect(motivoBloqueio("2026-10-03", "2026-10-02", SEM_DIAS_OFF)).toBe("fim-de-semana");
    expect(motivoBloqueio("2026-10-04", "2026-10-02", SEM_DIAS_OFF)).toBe("fim-de-semana");
    expect(primeiraDataPermitida("2026-10-02", SEM_DIAS_OFF)).toBe("2026-10-06");
  });

  it("pedido no sábado fica para terça (próximo dia útil)", () => {
    expect(motivoBloqueio("2026-10-04", "2026-10-03", SEM_DIAS_OFF)).toBe("fim-de-semana");
    expect(primeiraDataPermitida("2026-10-03", SEM_DIAS_OFF)).toBe("2026-10-06");
  });

  it("pedido no domingo fica para terça", () => {
    expect(primeiraDataPermitida("2026-10-04", SEM_DIAS_OFF)).toBe("2026-10-06");
  });

  it("o fim de semana seguinte continua valendo (quinta dele ainda não passou)", () => {
    expect(motivoBloqueio("2026-10-10", "2026-10-03", SEM_DIAS_OFF)).toBeNull();
    expect(motivoBloqueio("2026-10-11", "2026-10-02", SEM_DIAS_OFF)).toBeNull();
  });
});

describe("segunda-feira e dias sem produção", () => {
  it("segunda nunca é permitida pelo site", () => {
    for (const segunda of ["2026-10-05", "2026-10-12", "2026-11-16"]) {
      expect(motivoBloqueio(segunda, "2026-09-29", SEM_DIAS_OFF)).toBe("segunda");
    }
  });

  it("dia marcado como sem produção fica bloqueado e é pulado na primeira data", () => {
    const diasOff = new Set(["2026-12-24", "2026-12-25"]);
    expect(motivoBloqueio("2026-12-25", "2026-12-20", diasOff)).toBe("dia-off");
    expect(dataPermitida("2026-12-24", "2026-12-23", diasOff)).toBe(false);
    expect(primeiraDataPermitida("2026-12-23", diasOff)).toBe("2026-12-26");
  });

  it("mais longe que o limite fica bloqueado", () => {
    const hoje = "2026-09-29";
    expect(motivoBloqueio(somarDias(hoje, LIMITE_DIAS_A_FRENTE + 1), hoje, SEM_DIAS_OFF)).toBe("longe");
  });

  it("data que não existe não é permitida", () => {
    expect(dataPermitida("2026-02-30", "2026-01-10", SEM_DIAS_OFF)).toBe(false);
  });
});

describe("prazo de produção: só avisa, nunca bloqueia", () => {
  const prazos = { "p-bolo": 1, "p-cento": 3, "p-coca": 0 };
  const linhas = [
    { produtoId: "p-coca", nome: "Coca-cola 2L" },
    { produtoId: "p-bolo", nome: "Bolo" },
    { produtoId: "p-cento", nome: "Cento de docinho" },
    { produtoId: "p-desativado", nome: "Produto que saiu do catálogo" },
  ];

  it("acha o item mais demorado; produto que não veio do banco (desativado) fica fora", () => {
    expect(itemMaisDemorado(linhas, prazos)).toEqual({ nome: "Cento de docinho", dias: 3 });
    expect(itemMaisDemorado([linhas[3]], prazos)).toBeNull();
    expect(itemMaisDemorado([linhas[0]], prazos)).toBeNull();
  });

  it("data antes de o item ficar pronto é prazo curto, mas continua permitida", () => {
    const hoje = "2026-09-29"; // terça
    const item = itemMaisDemorado(linhas, prazos);
    expect(prontoEm(hoje, 3)).toBe("2026-10-02");
    expect(prazoCurto("2026-09-30", hoje, item)).toBe(true);
    expect(dataPermitida("2026-09-30", hoje, SEM_DIAS_OFF)).toBe(true);
    expect(prazoCurto("2026-10-01", hoje, item)).toBe(true);
    expect(prazoCurto("2026-10-02", hoje, item)).toBe(false);
    expect(prazoCurto("2026-10-03", hoje, null)).toBe(false);
  });

  it("o prazo não passa por cima das regras: prazo curto em data bloqueada continua bloqueada", () => {
    // Pedido na sexta com item de 1 dia: sábado fica pronto, mas sábado é
    // fim de semana fora do prazo.
    expect(prazoCurto("2026-10-03", "2026-10-02", { nome: "Bolo", dias: 1 })).toBe(false);
    expect(dataPermitida("2026-10-03", "2026-10-02", SEM_DIAS_OFF)).toBe(false);
  });
});

describe("horário por dia da semana", () => {
  it("terça a sábado: 9h às 17h30, de 30 em 30 minutos", () => {
    const h = horariosDoDia("2026-10-03");
    expect(h[0]).toBe("09:00");
    expect(h.at(-1)).toBe("17:30");
    expect(h).toHaveLength(18);
  });

  it("domingo: 9h às 14h30", () => {
    const h = horariosDoDia("2026-10-04");
    expect(h.at(-1)).toBe("14:30");
    expect(h).toHaveLength(12);
  });

  it("segunda: nenhum horário", () => {
    expect(horariosDoDia("2026-10-05")).toEqual([]);
  });

  it("rótulo", () => {
    expect(rotuloHorario("09:00")).toBe("9h");
    expect(rotuloHorario("14:30")).toBe("14h30");
  });
});

describe("fuso: sempre o dia de Brasília", () => {
  it("quinta 22h30 em Brasília (sexta em UTC): hoje é quinta e o sábado ainda vale", () => {
    const hoje = hojeBrasilia("2026-10-02T01:30:00Z");
    expect(hoje).toBe("2026-10-01");
    expect(dataPermitida("2026-10-03", hoje, SEM_DIAS_OFF)).toBe(true);
    // Se o dia viesse do UTC (sexta), o sábado cairia fora do prazo.
    expect(dataPermitida("2026-10-03", "2026-10-02", SEM_DIAS_OFF)).toBe(false);
  });

  it("sábado 23h em Brasília (domingo em UTC): primeira data é terça", () => {
    const hoje = hojeBrasilia("2026-10-04T02:00:00Z");
    expect(hoje).toBe("2026-10-03");
    expect(primeiraDataPermitida(hoje, SEM_DIAS_OFF)).toBe("2026-10-06");
  });
});
