import { describe, expect, it } from "vitest";
import { parseRecheioForm } from "./parse";

function form(campos: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

describe("parseRecheioForm", () => {
  it("recheio do Bolo: preço e grupo obrigatórios e gravados; vale_bento nunca é enviado", () => {
    const r = parseRecheioForm(form({ nome: " Brigadeiro ", preco_kg: "80.00", grupo: "chocolate_outros", ativo: "on" }));
    expect(r).toEqual({
      success: true,
      data: { nome: "Brigadeiro", vale_bolo: true, preco_kg: 80, grupo: "chocolate_outros", ativo: true },
    });
    expect(r.success && "vale_bento" in r.data).toBe(false);
  });

  it("campos de formulário antigos (vale_bolo, vale_bento) são ignorados: a coluna do Bento não é tocada", () => {
    const r = parseRecheioForm(form({ nome: "Ninho", vale_bento: "on", preco_kg: "50", grupo: "frutas" }));
    expect(r).toEqual({
      success: true,
      data: { nome: "Ninho", vale_bolo: true, preco_kg: 50, grupo: "frutas", ativo: false },
    });
  });

  it("aceita preço no formato brasileiro", () => {
    const r = parseRecheioForm(form({ nome: "Morango", preco_kg: "1.234,56", grupo: "frutas" }));
    expect(r.success && r.data.preco_kg).toBe(1234.56);
  });

  it.each([
    [{ nome: "", preco_kg: "10", grupo: "frutas" }, /nome do recheio/],
    [{ nome: "X" }, /preço por kg/],
    [{ nome: "X", preco_kg: "", grupo: "frutas" }, /preço por kg/],
    [{ nome: "X", preco_kg: "0", grupo: "frutas" }, /preço por kg/],
    [{ nome: "X", preco_kg: "10", grupo: "" }, /grupo/],
    [{ nome: "X", preco_kg: "10", grupo: "outro" }, /grupo/],
    [{ nome: "x".repeat(81), preco_kg: "10", grupo: "frutas" }, /no máximo 80/],
  ])("recusa %j", (campos, erro) => {
    const r = parseRecheioForm(form(campos as Record<string, string>));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toMatch(erro);
  });
});
