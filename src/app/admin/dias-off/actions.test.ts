import { beforeEach, describe, expect, it, vi } from "vitest";

const singleMock = vi.fn();
const selectMock = vi.fn(() => ({ single: singleMock }));
const insertMock = vi.fn(() => ({ select: selectMock }));
const eqDeleteMock = vi.fn();
const deleteMock = vi.fn(() => ({ eq: eqDeleteMock }));
const fromMock = vi.fn(() => ({ insert: insertMock, delete: deleteMock }));

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

describe("createDiaOff", () => {
  beforeEach(() => {
    singleMock.mockReset();
    selectMock.mockClear();
    insertMock.mockClear();
    fromMock.mockClear();
  });

  it("rejeita data no passado sem chamar o Supabase", async () => {
    const { createDiaOff } = await import("./actions");

    const result = await createDiaOff("2020-01-01");

    expect(result.error).toMatch(/passado/);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("insere e retorna o id quando o Supabase confirma", async () => {
    singleMock.mockResolvedValue({ data: { id: "abc-123" }, error: null });
    const { createDiaOff } = await import("./actions");

    const futura = new Date();
    futura.setFullYear(futura.getFullYear() + 1);
    const iso = futura.toISOString().slice(0, 10);

    const result = await createDiaOff(iso);

    expect(result.error).toBeUndefined();
    expect(result.id).toBe("abc-123");
    expect(fromMock).toHaveBeenCalledWith("dias_off");
    expect(insertMock).toHaveBeenCalledWith({ data: iso });
  });

  it("retorna mensagem amigável quando a data já está marcada (unique violation)", async () => {
    singleMock.mockResolvedValue({ data: null, error: { code: "23505", message: "duplicate key" } });
    const { createDiaOff } = await import("./actions");

    const futura = new Date();
    futura.setFullYear(futura.getFullYear() + 1);
    const iso = futura.toISOString().slice(0, 10);

    const result = await createDiaOff(iso);

    expect(result.error).toMatch(/já está marcada/);
  });

  it("retorna mensagem de erro genérica para outras falhas do Supabase", async () => {
    singleMock.mockResolvedValue({ data: null, error: { code: "500", message: "falha de rede" } });
    const { createDiaOff } = await import("./actions");

    const futura = new Date();
    futura.setFullYear(futura.getFullYear() + 1);
    const iso = futura.toISOString().slice(0, 10);

    const result = await createDiaOff(iso);

    expect(result.error).toMatch(/falha de rede/);
  });
});

describe("deleteDiaOff", () => {
  beforeEach(() => {
    eqDeleteMock.mockReset();
    deleteMock.mockClear();
    fromMock.mockClear();
  });

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
