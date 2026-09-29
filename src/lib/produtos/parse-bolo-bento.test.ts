import { describe, expect, it } from "vitest";
import { parseProdutoForm } from "./parse";

function form(campos: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

const BASE = { nome: "Produto", prazo_producao_dias: "2" };

describe("parseProdutoForm — Bolo e Bento Cake", () => {
  it("aceita as 6 categorias, incluindo Bento Cake", () => {
    const ok = (categoria: string, tipo: string) =>
      parseProdutoForm(form({ ...BASE, preco: "10", pedido_minimo: "1", step_quantidade: "livre", categoria, tipo })).success;
    expect(ok("Bolos", "normal")).toBe(true);
    expect(ok("Doces", "normal")).toBe(true);
    expect(ok("Bento Cake", "bento_cake")).toBe(true);
  });

  it("Bolo: só nome, categoria Bolos, tipo e prazo; sem preço nem mínimo; neutros marcados", () => {
    const r = parseProdutoForm(form({ ...BASE, categoria: "Bolos", tipo: "bolo" }));
    expect(r.success && r.data).toMatchObject({
      preco: 0,
      pedido_minimo: 1,
      step_quantidade: "livre",
      unidade_venda: null,
      semCamposDePreco: true,
    });
  });

  it("Bento Cake: exige preço e mínimo; step e unidade não valem", () => {
    const sem = parseProdutoForm(form({ ...BASE, categoria: "Bento Cake", tipo: "bento_cake" }));
    expect(sem.success).toBe(false);
    const ok = parseProdutoForm(form({ ...BASE, categoria: "Bento Cake", tipo: "bento_cake", preco: "60", pedido_minimo: "2" }));
    expect(ok.success && ok.data).toMatchObject({ preco: 60, pedido_minimo: 2, step_quantidade: "livre", unidade_venda: null, semCamposDePreco: false });
  });

  it("Smash Cake (normal em Bolos) é um avulso comum: preço, mínimo, step e unidade valem", () => {
    const r = parseProdutoForm(
      form({ ...BASE, categoria: "Bolos", tipo: "normal", preco: "70", pedido_minimo: "1", step_quantidade: "livre", unidade_venda: "unidade" })
    );
    expect(r.success && r.data).toMatchObject({ preco: 70, unidade_venda: "unidade", semCamposDePreco: false });
  });

  it("tipo e categoria têm que combinar", () => {
    const erro = (campos: Record<string, string>) => {
      const r = parseProdutoForm(form({ ...BASE, preco: "10", pedido_minimo: "1", step_quantidade: "livre", ...campos }));
      return r.success ? null : r.error;
    };
    expect(erro({ categoria: "Doces", tipo: "bolo" })).toMatch(/precisa estar na categoria Bolos/);
    expect(erro({ categoria: "Bolos", tipo: "bento_cake" })).toMatch(/precisa estar na categoria Bento Cake/);
    expect(erro({ categoria: "Bento Cake", tipo: "normal" })).toMatch(/categoria Bento Cake exige/);
    expect(erro({ categoria: "Bento Cake", tipo: "cento" })).toMatch(/categoria Bento Cake exige|Cento/);
  });

  it("tipo desconhecido continua recusado", () => {
    const r = parseProdutoForm(form({ ...BASE, preco: "10", pedido_minimo: "1", step_quantidade: "livre", categoria: "Doces", tipo: "smash_cake" }));
    expect(r.success).toBe(false);
  });
});
