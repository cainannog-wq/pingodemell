import { describe, expect, it } from "vitest";
import { parseRecheioForm } from "./parse";

function form(campos: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

describe("parseRecheioForm", () => {
  it("recheio de Bolo: preço e grupo obrigatórios e gravados", () => {
    const r = parseRecheioForm(form({ nome: " Brigadeiro ", vale_bolo: "on", preco_kg: "80.00", grupo: "chocolate_outros", ativo: "on" }));
    expect(r).toEqual({
      success: true,
      data: { nome: "Brigadeiro", vale_bolo: true, vale_bento: false, preco_kg: 80, grupo: "chocolate_outros", ativo: true },
    });
  });

  it("aceita preço no formato brasileiro", () => {
    const r = parseRecheioForm(form({ nome: "Morango", vale_bolo: "on", preco_kg: "1.234,56", grupo: "frutas" }));
    expect(r.success && r.data.preco_kg).toBe(1234.56);
  });

  it("recheio só de Bento: preço e grupo são ignorados e gravados nulos, mesmo que cheguem", () => {
    const r = parseRecheioForm(form({ nome: "Ninho", vale_bento: "on", preco_kg: "50", grupo: "frutas" }));
    expect(r).toEqual({
      success: true,
      data: { nome: "Ninho", vale_bolo: false, vale_bento: true, preco_kg: null, grupo: null, ativo: false },
    });
  });

  it("os dois lugares: preço e grupo se aplicam", () => {
    const r = parseRecheioForm(form({ nome: "Chocolate", vale_bolo: "on", vale_bento: "on", preco_kg: "60", grupo: "chocolate_outros" }));
    expect(r.success && [r.data.vale_bolo, r.data.vale_bento, r.data.preco_kg]).toEqual([true, true, 60]);
  });

  it.each([
    [{ nome: "", vale_bento: "on" }, /nome do recheio/],
    [{ nome: "X" }, /onde o recheio vale/i],
    [{ nome: "X", vale_bolo: "on", preco_kg: "", grupo: "frutas" }, /preço por kg/],
    [{ nome: "X", vale_bolo: "on", preco_kg: "0", grupo: "frutas" }, /preço por kg/],
    [{ nome: "X", vale_bolo: "on", preco_kg: "10", grupo: "" }, /grupo/],
    [{ nome: "X", vale_bolo: "on", preco_kg: "10", grupo: "outro" }, /grupo/],
    [{ nome: "x".repeat(81), vale_bento: "on" }, /no máximo 80/],
  ])("recusa %j", (campos, erro) => {
    const r = parseRecheioForm(form(campos as Record<string, string>));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toMatch(erro);
  });
});
