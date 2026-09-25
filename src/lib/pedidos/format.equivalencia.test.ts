import { afterEach, describe, expect, it, vi } from "vitest";
import {
  brasiliaAnoMes,
  brasiliaDiferencaDias,
  formatDataCurta,
  formatDataHoraCurta,
  formatDataHoraExtensa,
  formatDiaGrupo,
  formatHora,
} from "./format";

// Teste de equivalência (PR fuso-brasilia): a implementação ANTIGA do
// format.ts (deslocamento fixo de -3h, copiada abaixo e congelada) e a
// atual (módulo src/lib/tempo/brasilia.ts, via Intl no fuso
// America/Sao_Paulo) têm que dar o mesmo resultado para todas as horas de
// 2026, incluindo as viradas de mês e as duas viradas de ano (entrada em
// 2026 e em 2027). Brasília não tem horário de verão desde 2019, por isso
// as duas batem; se um dia voltar, este teste é o que avisa.

// --- implementação antiga, congelada ---------------------------------
const OFFSET = 3 * 60 * 60 * 1000;
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const p2 = (n: number) => String(n).padStart(2, "0");
const antigo = {
  br: (iso: string) => new Date(new Date(iso).getTime() - OFFSET),
  dataCurta(iso: string) {
    const d = antigo.br(iso);
    return `${p2(d.getUTCDate())}/${p2(d.getUTCMonth() + 1)}`;
  },
  hora(iso: string) {
    const d = antigo.br(iso);
    const min = d.getUTCMinutes();
    return `${p2(d.getUTCHours())}h${min > 0 ? p2(min) : ""}`;
  },
  dataHoraCurta: (iso: string) => `${antigo.dataCurta(iso)} · ${antigo.hora(iso)}`,
  dataHoraExtensa(iso: string) {
    const d = antigo.br(iso);
    return `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}, às ${antigo.hora(iso)}`;
  },
  anoMes(iso: string) {
    const d = antigo.br(iso);
    return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}`;
  },
  diaChave(iso: string) {
    const d = antigo.br(iso);
    return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
  },
  diferencaDias(iso: string) {
    const [ay, am, ad] = antigo.diaChave(iso).split("-").map(Number);
    const [hy, hm, hd] = antigo.diaChave(new Date().toISOString()).split("-").map(Number);
    return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(hy, hm - 1, hd)) / 86_400_000);
  },
  diaGrupo(iso: string) {
    const dias = antigo.diferencaDias(iso);
    if (dias === 0) return "Hoje";
    if (dias === 1) return "Amanhã";
    const d = antigo.br(iso);
    return `${DIAS[d.getUTCDay()]}, ${p2(d.getUTCDate())}/${p2(d.getUTCMonth() + 1)}`;
  },
};
// ---------------------------------------------------------------------

// Centenas de milhares de comparações: limite de 60s por teste (o padrão
// de 5s estoura com a suíte rodando em paralelo nos dois fusos).
const HORA = 3_600_000;
const INICIO = Date.UTC(2025, 11, 31, 0); // 31/12/2025 00h UTC (21h de 30/12 em Brasília)
const FIM = Date.UTC(2027, 0, 1, 6); // 01/01/2027 06h UTC (03h de 01/01 em Brasília)

afterEach(() => {
  vi.useRealTimers();
});

describe("format.ts: implementação antiga (-3h fixo) x atual (Intl, America/Sao_Paulo)", () => {
  it("formatação de datas e mês dos cards: iguais em todas as horas de 2026 (minuto 00 e 37)", () => {
    let comparados = 0;
    const diferencas: string[] = [];
    for (let t = INICIO; t <= FIM; t += HORA) {
      for (const minuto of [0, 37]) {
        const iso = new Date(t + minuto * 60_000).toISOString();
        const pares: [string, string, string][] = [
          ["formatDataCurta", antigo.dataCurta(iso), formatDataCurta(iso)],
          ["formatHora", antigo.hora(iso), formatHora(iso)],
          ["formatDataHoraCurta", antigo.dataHoraCurta(iso), formatDataHoraCurta(iso)],
          ["formatDataHoraExtensa", antigo.dataHoraExtensa(iso), formatDataHoraExtensa(iso)],
          ["brasiliaAnoMes", antigo.anoMes(iso), brasiliaAnoMes(iso)],
        ];
        for (const [nome, velho, novo] of pares) {
          comparados++;
          if (velho !== novo) diferencas.push(`${nome}(${iso}): antigo "${velho}" x atual "${novo}"`);
        }
      }
    }
    console.log(`[equivalência] formatação: ${comparados} comparações de ${new Date(INICIO).toISOString()} a ${new Date(FIM).toISOString()}, ${diferencas.length} diferença(s)`);
    expect(diferencas).toEqual([]);
  }, 60_000);

  it("Hoje/Amanhã/dia e diferença em dias: iguais com o relógio em cada 3h de 2026, pedidos de 3 dias antes a 3 dias depois", () => {
    vi.useFakeTimers();
    let comparados = 0;
    const diferencas: string[] = [];
    for (let agora = INICIO; agora <= FIM; agora += 3 * HORA) {
      vi.setSystemTime(agora);
      for (let h = -72; h <= 72; h += 5) {
        const iso = new Date(agora + h * HORA).toISOString();
        const pares: [string, string | number, string | number][] = [
          ["brasiliaDiferencaDias", antigo.diferencaDias(iso), brasiliaDiferencaDias(iso)],
          ["formatDiaGrupo", antigo.diaGrupo(iso), formatDiaGrupo(iso)],
        ];
        for (const [nome, velho, novo] of pares) {
          comparados++;
          if (velho !== novo) diferencas.push(`${nome}(${iso}) às ${new Date(agora).toISOString()}: antigo "${velho}" x atual "${novo}"`);
        }
      }
    }
    console.log(`[equivalência] dia relativo: ${comparados} comparações, ${diferencas.length} diferença(s)`);
    expect(diferencas).toEqual([]);
  }, 60_000);
});
