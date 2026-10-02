// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { concluirSalvarPendente, guardarSalvarPendente, type SalvarPendente } from "./tempos";

// Registro de tempo do Salvar: só existe com MEDIR_TEMPOS_ADMIN="1" (build
// da homologação, next.config.ts). Sem isso, nada vai para o console nem
// para a sessionStorage. A prova de que o build de produção nem carrega o
// código está na descrição do PR (busca no bundle depois do build).

const INICIO = Date.parse("2026-09-28T13:00:00.000Z");

function pendente(extra: Partial<SalvarPendente> = {}): SalvarPendente {
  return {
    produtoId: "197d31af-803d-4af9-b6d4-66fd013dff4d",
    nome: "Brigadeiro Gourmet",
    inicio: INICIO,
    prepararMs: 300,
    enviarMs: 1200,
    inicioGravar: INICIO + 1500,
    reducao: { arquivo: "IMG_1234.jpg", bytesOriginal: 6.2 * 1024 * 1024, bytesFinal: 1.3 * 1024 * 1024, largura: 2000, altura: 1500, ms: 900 },
    ...extra,
  };
}

let info: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  sessionStorage.clear();
  info = vi.spyOn(console, "info").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  info.mockRestore();
});

describe("registro de tempo do Salvar", () => {
  for (const valor of ["", undefined]) {
    it(`fora da homologação (MEDIR_TEMPOS_ADMIN=${JSON.stringify(valor)}): nada no console nem na sessionStorage`, () => {
      vi.stubEnv("MEDIR_TEMPOS_ADMIN", valor);
      guardarSalvarPendente(pendente());
      concluirSalvarPendente("salvo", INICIO + 4200);
      expect(sessionStorage.length).toBe(0);
      expect(info).not.toHaveBeenCalled();
    });
  }

  it("na homologação: uma linha por Salvar (nome, id, total e etapas) e a redução à parte", () => {
    vi.stubEnv("MEDIR_TEMPOS_ADMIN", "1");
    guardarSalvarPendente(pendente());
    concluirSalvarPendente("salvo", INICIO + 4200);
    const linhas = info.mock.calls.map((c) => c[0] as string);
    expect(linhas).toEqual([
      "[tempo capa] 1 Salvar nesta aba (o mais recente por último):",
      '[tempo capa] Salvar "Brigadeiro Gourmet" (id 197d31af-803d-4af9-b6d4-66fd013dff4d): total 4,2 s · preparar 0,3 s · enviar 1,2 s · gravar 2,7 s',
      '[tempo redução] "Brigadeiro Gourmet": 0,9 s ao escolher "IMG_1234.jpg" (6,2 MB → 1,3 MB, 2000×1500) — fora do critério de 10 s',
    ]);
  });

  it("guarda o histórico da aba: a listagem mostra todos os Salvar, o mais recente por último", () => {
    vi.stubEnv("MEDIR_TEMPOS_ADMIN", "1");
    guardarSalvarPendente(pendente({ nome: "Empada de palmito" }));
    concluirSalvarPendente("salvo", INICIO + 3000);
    guardarSalvarPendente(pendente({ nome: "Risole de carne", reducao: null }));
    concluirSalvarPendente("erro", INICIO + 5000);
    const linhas = info.mock.calls.map((c) => c[0] as string).slice(3);
    expect(linhas[0]).toBe("[tempo capa] 2 Salvar nesta aba (o mais recente por último):");
    expect(linhas[3]).toMatch(/^\[tempo capa\] Salvar COM ERRO "Risole de carne"/);
    expect(linhas[4]).toBe('[tempo redução] "Risole de carne": sem foto de capa nova');
  });

  it("listagem aberta sem Salvar pendente, ou pendente antigo (aba recarregada): não escreve nada", () => {
    vi.stubEnv("MEDIR_TEMPOS_ADMIN", "1");
    concluirSalvarPendente("salvo", INICIO);
    guardarSalvarPendente(pendente());
    concluirSalvarPendente("salvo", INICIO + 3 * 60 * 1000);
    expect(info).not.toHaveBeenCalled();
  });
});
