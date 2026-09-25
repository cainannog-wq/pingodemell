import { describe, expect, it } from "vitest";
import { parseDiaOffData, parseReaberturaData } from "./parse";

// Terça-feira, 22/09/2026 ao meio-dia de Brasília — instante explícito, para
// o teste dar o mesmo resultado em qualquer fuso em que rode.
const hoje = new Date("2026-09-22T12:00:00-03:00");

describe("parseDiaOffData", () => {
  it("aceita a data de hoje (terça-feira)", () => {
    const result = parseDiaOffData("2026-09-22", hoje);
    expect(result).toEqual({ success: true, data: "2026-09-22" });
  });

  it("aceita uma data futura que não é segunda-feira", () => {
    const result = parseDiaOffData("2026-10-13", hoje); // terça-feira
    expect(result).toEqual({ success: true, data: "2026-10-13" });
  });

  it("rejeita uma data no passado", () => {
    const result = parseDiaOffData("2026-09-21", hoje);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/passado/);
  });

  it("rejeita segunda-feira — segunda é fechada por padrão, usa o mecanismo de reabertura", () => {
    const result = parseDiaOffData("2026-10-12", hoje); // segunda-feira
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/fechada por padrão/);
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

describe("parseReaberturaData", () => {
  it("aceita uma segunda-feira futura", () => {
    const result = parseReaberturaData("2026-10-12", hoje); // segunda-feira
    expect(result).toEqual({ success: true, data: "2026-10-12" });
  });

  it("rejeita uma data que não é segunda-feira", () => {
    const result = parseReaberturaData("2026-10-13", hoje); // terça-feira
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/segunda-feira/);
  });

  it("rejeita uma segunda-feira no passado", () => {
    const result = parseReaberturaData("2026-09-14", hoje); // segunda-feira passada
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/passado/);
  });

  it("rejeita formato inválido", () => {
    const result = parseReaberturaData("12/10/2026", hoje);
    expect(result.success).toBe(false);
  });
});
