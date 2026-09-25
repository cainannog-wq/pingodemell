import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  anoMesBrasilia,
  diaDaSemana,
  diasNoMes,
  diferencaEmDias,
  FUSO,
  hojeBrasilia,
  lerDataIso,
  partesBrasilia,
  somarMeses,
} from "./brasilia";
import { parseDiaOffData, parseReaberturaData } from "@/lib/dias-off/parse";
import { formatDiaGrupo } from "@/lib/pedidos/format";

// Relógio fixado nos horários críticos: entre 21h e meia-noite de Brasília,
// o dia em UTC (fuso do servidor na Netlify e do Supabase) já é o seguinte.
// A suíte roda em dois fusos de processo (UTC e America/Sao_Paulo, ver
// vitest.config.ts); o resultado tem que ser o mesmo nos dois.

const DOMINGO = 0;
const SEGUNDA = 1;
const QUINTA = 4;

type Momento = {
  nome: string;
  instante: string; // UTC
  hoje: string; // calendário de Brasília
  diaDaSemana: number;
  anoMes: string;
  hora: number;
};

const MOMENTOS: Momento[] = [
  { nome: "domingo 27/09 às 22h", instante: "2026-09-28T01:00:00Z", hoje: "2026-09-27", diaDaSemana: DOMINGO, anoMes: "2026-09", hora: 22 },
  { nome: "segunda 28/09 às 22h", instante: "2026-09-29T01:00:00Z", hoje: "2026-09-28", diaDaSemana: SEGUNDA, anoMes: "2026-09", hora: 22 },
  { nome: "quinta 24/09 às 22h", instante: "2026-09-25T01:00:00Z", hoje: "2026-09-24", diaDaSemana: QUINTA, anoMes: "2026-09", hora: 22 },
  { nome: "30/09 às 22h (virada de mês)", instante: "2026-10-01T01:00:00Z", hoje: "2026-09-30", diaDaSemana: 3, anoMes: "2026-09", hora: 22 },
  { nome: "31/12 às 22h (virada de ano)", instante: "2027-01-01T01:00:00Z", hoje: "2026-12-31", diaDaSemana: 4, anoMes: "2026-12", hora: 22 },
  { nome: "dia comum às 10h (terça 22/09)", instante: "2026-09-22T13:00:00Z", hoje: "2026-09-22", diaDaSemana: 2, anoMes: "2026-09", hora: 10 },
];

describe(`módulo de tempo (${FUSO}) com o relógio fixado`, () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  for (const m of MOMENTOS) {
    it(`${m.nome}: hoje ${m.hoje}, dia da semana ${m.diaDaSemana}, mês ${m.anoMes}`, () => {
      vi.setSystemTime(new Date(m.instante));

      expect(hojeBrasilia()).toBe(m.hoje);
      expect(hojeBrasilia(new Date(m.instante))).toBe(m.hoje);
      expect(diaDaSemana(hojeBrasilia())).toBe(m.diaDaSemana);
      expect(anoMesBrasilia()).toBe(m.anoMes);
      expect(partesBrasilia().hora).toBe(m.hora);
      expect(partesBrasilia().diaDaSemana).toBe(m.diaDaSemana);
    });
  }

  it("domingo 27/09 às 22h: marcar o próprio domingo é aceito; ontem (sábado 26) é passado", () => {
    vi.setSystemTime(new Date("2026-09-28T01:00:00Z"));
    expect(parseDiaOffData("2026-09-27")).toEqual({ success: true, data: "2026-09-27" });
    expect(parseDiaOffData("2026-09-26")).toMatchObject({ success: false, error: expect.stringMatching(/passado/) });
    expect(parseReaberturaData("2026-09-28")).toEqual({ success: true, data: "2026-09-28" });
  });

  it("segunda 28/09 às 22h: reabrir a própria segunda é aceito", () => {
    vi.setSystemTime(new Date("2026-09-29T01:00:00Z"));
    expect(parseReaberturaData("2026-09-28")).toEqual({ success: true, data: "2026-09-28" });
  });

  it("quinta 24/09 às 22h: ainda é quinta (base do prazo \"fim de semana, até quinta\")", () => {
    vi.setSystemTime(new Date("2026-09-25T01:00:00Z"));
    expect(diaDaSemana(hojeBrasilia())).toBe(QUINTA);
    expect(diferencaEmDias(hojeBrasilia(), "2026-09-26")).toBe(2); // sábado
  });

  it("domingo 27/09 às 22h: pedido às 23h30 é \"Hoje\" e o de segunda 10h é \"Amanhã\"", () => {
    vi.setSystemTime(new Date("2026-09-28T01:00:00Z"));
    expect(formatDiaGrupo("2026-09-27T23:30:00-03:00")).toBe("Hoje");
    expect(formatDiaGrupo("2026-09-28T10:00:00-03:00")).toBe("Amanhã");
    expect(formatDiaGrupo("2026-09-26T10:00:00-03:00")).toBe("Sáb, 26/09");
  });
});

describe("fuso do processo de teste", () => {
  it("o processo está mesmo no fuso do projeto (UTC ou America/Sao_Paulo)", () => {
    const deslocamento = new Date("2026-09-28T01:00:00Z").getTimezoneOffset();
    const esperado: Record<string, number> = { UTC: 0, "America/Sao_Paulo": 180 };
    expect(process.env.TZ).toBeDefined();
    expect(deslocamento).toBe(esperado[process.env.TZ!]);
  });
});

describe("datas de calendário (sem fuso)", () => {
  it("dia da semana de datas conhecidas", () => {
    expect(diaDaSemana("2026-09-27")).toBe(DOMINGO);
    expect(diaDaSemana("2026-09-28")).toBe(SEGUNDA);
    expect(diaDaSemana("2027-01-01")).toBe(5); // sexta
    expect(diaDaSemana("2028-02-29")).toBe(2); // terça, ano bissexto
  });

  it("lerDataIso aceita só datas que existem", () => {
    expect(lerDataIso("2026-09-27")).toEqual({ ano: 2026, mes: 9, dia: 27 });
    expect(lerDataIso(" 2026-09-27 ")).toEqual({ ano: 2026, mes: 9, dia: 27 });
    expect(lerDataIso("2026-02-31")).toBeNull();
    expect(lerDataIso("27/09/2026")).toBeNull();
    expect(lerDataIso("")).toBeNull();
  });

  it("dias no mês e mês vizinho, inclusive na virada de ano", () => {
    expect(diasNoMes(2026, 2)).toBe(28);
    expect(diasNoMes(2028, 2)).toBe(29);
    expect(diasNoMes(2026, 12)).toBe(31);
    expect(somarMeses(2026, 12, 1)).toEqual({ ano: 2027, mes: 1 });
    expect(somarMeses(2026, 1, -1)).toEqual({ ano: 2025, mes: 12 });
    expect(somarMeses(2026, 9, 0)).toEqual({ ano: 2026, mes: 9 });
  });

  it("diferença em dias atravessando mês e ano", () => {
    expect(diferencaEmDias("2026-09-30", "2026-10-01")).toBe(1);
    expect(diferencaEmDias("2026-12-31", "2027-01-01")).toBe(1);
    expect(diferencaEmDias("2026-09-28", "2026-09-27")).toBe(-1);
  });
});
