import { describe, expect, it } from "vitest";
import { parseDiaOffData } from "./parse";

const hoje = new Date(2026, 8, 22); // 22/09/2026

describe("parseDiaOffData", () => {
  it("aceita a data de hoje", () => {
    const result = parseDiaOffData("2026-09-22", hoje);
    expect(result).toEqual({ success: true, data: "2026-09-22" });
  });

  it("aceita uma data futura", () => {
    const result = parseDiaOffData("2026-10-12", hoje);
    expect(result).toEqual({ success: true, data: "2026-10-12" });
  });

  it("rejeita uma data no passado", () => {
    const result = parseDiaOffData("2026-09-21", hoje);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/passado/);
  });

  it("rejeita formato inválido", () => {
    const result = parseDiaOffData("12/10/2026", hoje);
    expect(result.success).toBe(false);
  });

  it("rejeita string vazia", () => {
    const result = parseDiaOffData("", hoje);
    expect(result.success).toBe(false);
  });

  it("rejeita data calendaricamente inválida (ex.: 31 de fevereiro)", () => {
    const result = parseDiaOffData("2026-02-31", hoje);
    expect(result.success).toBe(false);
  });
});
