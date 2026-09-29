import { describe, expect, it } from "vitest";
import {
  agruparRecheiosDoBolo,
  bentoDisponivel,
  boloDisponivel,
  menorPrecoKg,
  precoDoBolo,
  recheiosDoBento,
  recheiosDoBolo,
} from "./regras";

let n = 0;
function r(parcial: Record<string, unknown>) {
  n += 1;
  return {
    id: `r${n}`,
    nome: `Recheio ${n}`,
    vale_bolo: false,
    vale_bento: false,
    preco_kg: null as number | null,
    grupo: null as "frutas" | "chocolate_outros" | null,
    ativo: true,
    ...parcial,
  };
}

const BRIGADEIRO = r({ nome: "Brigadeiro", vale_bolo: true, vale_bento: true, preco_kg: 80, grupo: "chocolate_outros" });
const MORANGO = r({ nome: "Morango", vale_bolo: true, preco_kg: 95, grupo: "frutas" });
const ABACAXI = r({ nome: "Abacaxi", vale_bolo: true, preco_kg: 70, grupo: "frutas" });
const NINHO = r({ nome: "Ninho", vale_bento: true });
const INATIVO = r({ nome: "Inativo", vale_bolo: true, vale_bento: true, preco_kg: 10, grupo: "frutas", ativo: false });
const TODOS = [BRIGADEIRO, MORANGO, ABACAXI, NINHO, INATIVO];

describe("recheios — dois catálogos sobre a mesma tabela", () => {
  it("Bolo: só ativo com vale_bolo, com preço e grupo; ordem alfabética", () => {
    expect(recheiosDoBolo(TODOS).map((x) => x.nome)).toEqual(["Abacaxi", "Brigadeiro", "Morango"]);
  });

  it("Bento: só ativo com vale_bento (o preço e o grupo não contam)", () => {
    expect(recheiosDoBento(TODOS).map((x) => x.nome)).toEqual(["Brigadeiro", "Ninho"]);
  });

  it("recheio de Bolo sem preço ou sem grupo (dado inconsistente) não aparece no Bolo", () => {
    expect(
      recheiosDoBolo([r({ vale_bolo: true, preco_kg: null, grupo: "frutas" }), r({ vale_bolo: true, preco_kg: 50, grupo: null })])
    ).toEqual([]);
  });

  it("agrupa em Frutas e depois Chocolate e outros; grupo vazio some", () => {
    expect(agruparRecheiosDoBolo(TODOS).map((g) => [g.rotulo, g.recheios.map((x) => x.nome)])).toEqual([
      ["Recheio com Frutas", ["Abacaxi", "Morango"]],
      ["Recheio com chocolate e outros", ["Brigadeiro"]],
    ]);
    expect(agruparRecheiosDoBolo([BRIGADEIRO]).map((g) => g.rotulo)).toEqual(["Recheio com chocolate e outros"]);
  });

  it("menor R$/kg é o 'a partir de' do card (ignora inativo e recheio só de Bento)", () => {
    expect(menorPrecoKg(TODOS)).toBe(70);
    expect(menorPrecoKg([NINHO])).toBeNull();
  });

  it("os dois lados esvaziam de forma independente", () => {
    const semBento = TODOS.map((x) => ({ ...x, vale_bento: false }));
    expect(boloDisponivel(semBento)).toBe(true);
    expect(bentoDisponivel(semBento)).toBe(false);
    const semBolo = TODOS.map((x) => ({ ...x, vale_bolo: false, preco_kg: null, grupo: null }));
    expect(boloDisponivel(semBolo)).toBe(false);
    expect(bentoDisponivel(semBolo)).toBe(true);
    expect(boloDisponivel([])).toBe(false);
    expect(bentoDisponivel([])).toBe(false);
  });

  it("preço do Bolo = R$/kg × kg, ao centavo", () => {
    expect(precoDoBolo(80, 3)).toBe(240);
    expect(precoDoBolo(79.99, 3)).toBe(239.97);
    expect(precoDoBolo(33.33, 3)).toBe(99.99);
  });
});
