import { describe, expect, it } from "vitest";
import {
  erroQuantidade,
  MAX_QUANTIDADE,
  normalizarQuantidade,
  passoDoStep,
  passoQuantidade,
  quantidadeInicial,
  quantidadeMaxima,
  quantidadeValida,
} from "./quantidade";

describe("seletor do avulso — pedido_minimo e step_quantidade", () => {
  it("passo: livre 1, múltiplos de 5 e de 10", () => {
    expect(passoDoStep("livre")).toBe(1);
    expect(passoDoStep("multiplos_5")).toBe(5);
    expect(passoDoStep("multiplos_10")).toBe(10);
  });

  it("começa no mínimo; se o mínimo não bate com o step, sobe até o múltiplo", () => {
    expect(quantidadeInicial(10, "livre")).toBe(10);
    expect(quantidadeInicial(1, "livre")).toBe(1);
    expect(quantidadeInicial(20, "multiplos_5")).toBe(20);
    expect(quantidadeInicial(12, "multiplos_5")).toBe(15);
    expect(quantidadeInicial(1, "multiplos_10")).toBe(10);
    expect(quantidadeInicial(30, "multiplos_10")).toBe(30);
  });

  it("aceita só inteiro, >= mínimo, múltiplo do step e até o teto", () => {
    expect(quantidadeValida(10, 10, "livre")).toBe(true);
    expect(quantidadeValida(11, 10, "livre")).toBe(true);
    expect(quantidadeValida(9, 10, "livre")).toBe(false);
    expect(quantidadeValida(25, 20, "multiplos_5")).toBe(true);
    expect(quantidadeValida(22, 20, "multiplos_5")).toBe(false);
    expect(quantidadeValida(10, 12, "multiplos_5")).toBe(false);
    expect(quantidadeValida(15, 12, "multiplos_5")).toBe(true);
    expect(quantidadeValida(40, 1, "multiplos_10")).toBe(true);
    expect(quantidadeValida(45, 1, "multiplos_10")).toBe(false);
    expect(quantidadeValida(1.5, 1, "livre")).toBe(false);
    expect(quantidadeValida(0, 1, "livre")).toBe(false);
    expect(quantidadeValida(MAX_QUANTIDADE + 1, 1, "livre")).toBe(false);
  });

  it("mensagem para a cliente", () => {
    expect(erroQuantidade(5, 10, "livre")).toBe("Quantidade mínima: 10");
    expect(erroQuantidade(10, 12, "multiplos_5")).toBe("Quantidade mínima: 15");
    expect(erroQuantidade(22, 20, "multiplos_5")).toBe("Escolha em múltiplos de 5.");
    expect(erroQuantidade(1.5, 1, "livre")).toBe("Use um número inteiro.");
    expect(erroQuantidade(20, 20, "multiplos_5")).toBeNull();
  });

  it("+ e − andam um step e não passam do mínimo nem do teto", () => {
    expect(passoQuantidade(10, 1, 10, "livre")).toBe(11);
    expect(passoQuantidade(10, -1, 10, "livre")).toBe(10);
    expect(passoQuantidade(20, 1, 20, "multiplos_5")).toBe(25);
    expect(passoQuantidade(25, -1, 20, "multiplos_5")).toBe(20);
    expect(passoQuantidade(20, -1, 20, "multiplos_5")).toBe(20);
    expect(passoQuantidade(10, 1, 1, "multiplos_10")).toBe(20);
    expect(passoQuantidade(quantidadeMaxima("multiplos_10"), 1, 1, "multiplos_10")).toBe(quantidadeMaxima("multiplos_10"));
    expect(quantidadeMaxima("multiplos_10") % 10).toBe(0);
  });

  it("número digitado errado vai para o valor aceito mais próximo, para cima", () => {
    expect(normalizarQuantidade(3, 10, "livre")).toBe(10);
    expect(normalizarQuantidade(22, 20, "multiplos_5")).toBe(25);
    expect(normalizarQuantidade(NaN, 20, "multiplos_5")).toBe(20);
    expect(normalizarQuantidade(10 ** 9, 1, "livre")).toBe(MAX_QUANTIDADE);
    expect(normalizarQuantidade(7.8, 1, "livre")).toBe(7);
  });
});
