import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const singleMock = vi.fn();
const selectMock = vi.fn(() => ({ single: singleMock }));
const insertMock = vi.fn(() => ({ select: selectMock }));
const eqDeleteMock = vi.fn();
const deleteMock = vi.fn(() => ({ eq: eqDeleteMock }));
const eqUpdateMock = vi.fn();
const updateMock = vi.fn(() => ({ eq: eqUpdateMock }));
const fromMock = vi.fn(() => ({ insert: insertMock, delete: deleteMock, update: updateMock }));

vi.mock("@/lib/supabase/dal", () => ({
  requireAuth: vi.fn().mockResolvedValue({ id: "user-1" }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: fromMock,
  })),
}));

// Relógio fixo no horário crítico: domingo 27/09/2026 às 22h de Brasília,
// quando em UTC (fuso do servidor na Netlify) já é segunda 28/09 às 01h.
// Antes do PR fuso-brasilia, estes testes calculavam as datas pelo relógio
// real e falhavam entre 21h e meia-noite de Brasília.
const DOMINGO_22H_BRASILIA = new Date("2026-09-28T01:00:00Z");
const HOJE_BRASILIA = "2026-09-27"; // domingo
const SEGUNDA_FUTURA = "2026-10-05";
const TERCA_FUTURA = "2026-10-06";

function terçaFutura() {
  return TERCA_FUTURA;
}

function segundaFutura() {
  return SEGUNDA_FUTURA;
}

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(DOMINGO_22H_BRASILIA);
});

afterAll(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  singleMock.mockReset();
  selectMock.mockClear();
  insertMock.mockClear();
  eqDeleteMock.mockReset();
  deleteMock.mockClear();
  eqUpdateMock.mockReset();
  updateMock.mockClear();
  fromMock.mockClear();
});

describe("createDiaOff", () => {
  it("rejeita data no passado sem chamar o Supabase", async () => {
    const { createDiaOff } = await import("./actions");
    const result = await createDiaOff("2020-01-01");
    expect(result.error).toMatch(/passado/);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("rejeita segunda-feira sem chamar o Supabase", async () => {
    const { createDiaOff } = await import("./actions");
    const result = await createDiaOff(segundaFutura());
    expect(result.error).toMatch(/fechada por padrão/);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("insere e retorna o id quando o Supabase confirma", async () => {
    singleMock.mockResolvedValue({ data: { id: "abc-123" }, error: null });
    const { createDiaOff } = await import("./actions");

    const iso = terçaFutura();
    const result = await createDiaOff(iso);

    expect(result.error).toBeUndefined();
    expect(result.id).toBe("abc-123");
    expect(fromMock).toHaveBeenCalledWith("dias_off");
    expect(insertMock).toHaveBeenCalledWith({ data: iso });
  });

  it("domingo às 22h de Brasília (segunda 01h em UTC): aceita marcar o próprio domingo, que é hoje", async () => {
    singleMock.mockResolvedValue({ data: { id: "hoje-1" }, error: null });
    const { createDiaOff } = await import("./actions");

    const result = await createDiaOff(HOJE_BRASILIA);

    expect(result.error).toBeUndefined();
    expect(insertMock).toHaveBeenCalledWith({ data: HOJE_BRASILIA });
  });

  it("retorna mensagem amigável quando a data já está marcada (unique violation)", async () => {
    singleMock.mockResolvedValue({ data: null, error: { code: "23505", message: "duplicate key" } });
    const { createDiaOff } = await import("./actions");
    const result = await createDiaOff(terçaFutura());
    expect(result.error).toMatch(/já está marcada/);
  });
});

describe("deleteDiaOff", () => {
  it("remove sem retornar erro quando o Supabase confirma", async () => {
    eqDeleteMock.mockResolvedValue({ error: null });
    const { deleteDiaOff } = await import("./actions");
    const result = await deleteDiaOff("abc-123");
    expect(result.error).toBeUndefined();
    expect(fromMock).toHaveBeenCalledWith("dias_off");
    expect(eqDeleteMock).toHaveBeenCalledWith("id", "abc-123");
  });

  it("retorna mensagem de erro quando o Supabase falha", async () => {
    eqDeleteMock.mockResolvedValue({ error: { message: "falha de rede" } });
    const { deleteDiaOff } = await import("./actions");
    const result = await deleteDiaOff("abc-123");
    expect(result.error).toMatch(/falha de rede/);
  });
});

describe("updateDiaOffObservacao", () => {
  it("salva a observação com trim, virando null quando fica vazia", async () => {
    eqUpdateMock.mockResolvedValue({ error: null });
    const { updateDiaOffObservacao } = await import("./actions");
    const result = await updateDiaOffObservacao("abc-123", "   ");
    expect(result.error).toBeUndefined();
    expect(updateMock).toHaveBeenCalledWith({ observacao: null });
  });

  it("salva o texto informado, sem espaços nas pontas", async () => {
    eqUpdateMock.mockResolvedValue({ error: null });
    const { updateDiaOffObservacao } = await import("./actions");
    await updateDiaOffObservacao("abc-123", "  manutenção do forno  ");
    expect(updateMock).toHaveBeenCalledWith({ observacao: "manutenção do forno" });
  });
});

describe("createReabertura", () => {
  it("rejeita data que não é segunda-feira sem chamar o Supabase", async () => {
    const { createReabertura } = await import("./actions");
    const result = await createReabertura(terçaFutura());
    expect(result.error).toMatch(/segunda-feira/);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("rejeita segunda-feira no passado sem chamar o Supabase", async () => {
    const { createReabertura } = await import("./actions");
    const result = await createReabertura("2020-01-06"); // segunda-feira no passado
    expect(result.error).toMatch(/passado/);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("segunda às 22h de Brasília (terça 01h em UTC): aceita reabrir a própria segunda, que é hoje", async () => {
    vi.setSystemTime(new Date("2026-09-29T01:00:00Z"));
    try {
      singleMock.mockResolvedValue({ data: { id: "reab-hoje" }, error: null });
      const { createReabertura } = await import("./actions");
      const result = await createReabertura("2026-09-28");
      expect(result.error).toBeUndefined();
      expect(insertMock).toHaveBeenCalledWith({ data: "2026-09-28" });
    } finally {
      vi.setSystemTime(DOMINGO_22H_BRASILIA);
    }
  });

  it("insere e retorna o id quando o Supabase confirma", async () => {
    singleMock.mockResolvedValue({ data: { id: "reab-1" }, error: null });
    const { createReabertura } = await import("./actions");

    const iso = segundaFutura();
    const result = await createReabertura(iso);

    expect(result.error).toBeUndefined();
    expect(result.id).toBe("reab-1");
    expect(fromMock).toHaveBeenCalledWith("segunda_reaberturas");
    expect(insertMock).toHaveBeenCalledWith({ data: iso });
  });

  it("retorna mensagem amigável quando a segunda já está reaberta (unique violation)", async () => {
    singleMock.mockResolvedValue({ data: null, error: { code: "23505", message: "duplicate key" } });
    const { createReabertura } = await import("./actions");
    const result = await createReabertura(segundaFutura());
    expect(result.error).toMatch(/já está reaberta/);
  });
});

describe("deleteReabertura", () => {
  it("remove sem retornar erro quando o Supabase confirma", async () => {
    eqDeleteMock.mockResolvedValue({ error: null });
    const { deleteReabertura } = await import("./actions");
    const result = await deleteReabertura("reab-1");
    expect(result.error).toBeUndefined();
    expect(fromMock).toHaveBeenCalledWith("segunda_reaberturas");
    expect(eqDeleteMock).toHaveBeenCalledWith("id", "reab-1");
  });
});

describe("updateReaberturaObservacao", () => {
  it("salva o texto informado na tabela de reaberturas", async () => {
    eqUpdateMock.mockResolvedValue({ error: null });
    const { updateReaberturaObservacao } = await import("./actions");
    await updateReaberturaObservacao("reab-1", "evento da cliente");
    expect(fromMock).toHaveBeenCalledWith("segunda_reaberturas");
    expect(updateMock).toHaveBeenCalledWith({ observacao: "evento da cliente" });
  });
});
