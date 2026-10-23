import { describe, expect, it } from "vitest";
import {
  ajustarKgAoTrocarFormato,
  detalheDoBolo,
  erroKg,
  FORMATO_BOLO_LABELS,
  FORMATOS_BOLO,
  formatoDoPedido,
  formatoValido,
  kgValido,
  limitesKg,
  normalizarKg,
  passoKg,
} from "./bolo";

describe("Bolo — peso por formato (retangular 2 a 5 kg, redondo 1 a 4 kg)", () => {
  it("limites de cada formato", () => {
    expect(limitesKg("retangular")).toEqual({ min: 2, max: 5 });
    expect(limitesKg("redondo")).toEqual({ min: 1, max: 4 });
  });

  it("o quadrado antigo usa as regras do retangular", () => {
    expect(limitesKg("quadrado")).toEqual({ min: 2, max: 5 });
    expect(kgValido(1, "quadrado")).toBe(false);
    expect(kgValido(5, "quadrado")).toBe(true);
    expect(erroKg(6, "quadrado")).toBe("Tamanho máximo para bolo retangular: 5 kg");
  });

  it.each([
    ["retangular", 1, false],
    ["retangular", 2, true],
    ["retangular", 3, true],
    ["retangular", 5, true],
    ["retangular", 6, false],
    ["redondo", 0, false],
    ["redondo", 1, true],
    ["redondo", 4, true],
    ["redondo", 5, false],
    ["redondo", 1.5, false],
    ["retangular", 2.5, false],
  ] as const)("%s com %s kg: válido = %s", (formato, kg, valido) => {
    expect(kgValido(kg, formato)).toBe(valido);
    expect(erroKg(kg, formato) === null).toBe(valido);
  });

  it("mensagens claras fora do limite", () => {
    expect(erroKg(1, "retangular")).toBe("Tamanho mínimo para bolo retangular: 2 kg");
    expect(erroKg(6, "retangular")).toBe("Tamanho máximo para bolo retangular: 5 kg");
    expect(erroKg(0, "redondo")).toBe("Tamanho mínimo para bolo redondo: 1 kg");
    expect(erroKg(5, "redondo")).toBe("Tamanho máximo para bolo redondo: 4 kg");
    expect(erroKg(1.5, "redondo")).toBe("Use um número inteiro de quilos.");
  });

  it("passo de 1 em 1 kg, parando nos limites do formato", () => {
    expect(passoKg(2, 1, "retangular")).toBe(3);
    expect(passoKg(2, -1, "retangular")).toBe(2);
    expect(passoKg(5, 1, "retangular")).toBe(5);
    expect(passoKg(1, -1, "redondo")).toBe(1);
    expect(passoKg(4, 1, "redondo")).toBe(4);
  });

  it("normaliza para o limite mais próximo", () => {
    expect(normalizarKg(NaN, "retangular")).toBe(2);
    expect(normalizarKg(-3, "redondo")).toBe(1);
    expect(normalizarKg(2.9, "redondo")).toBe(2);
    expect(normalizarKg(999, "redondo")).toBe(4);
    expect(normalizarKg(999, "retangular")).toBe(5);
    expect(normalizarKg(1, "retangular")).toBe(2);
  });

  it("trocar o formato ajusta o peso fora da nova faixa e avisa", () => {
    expect(ajustarKgAoTrocarFormato(1, "retangular")).toEqual({
      kg: 2,
      aviso: "Bolo retangular aceita de 2 a 5 kg. Ajustamos o tamanho para 2 kg.",
    });
    expect(ajustarKgAoTrocarFormato(5, "redondo")).toEqual({
      kg: 4,
      aviso: "Bolo redondo aceita de 1 a 4 kg. Ajustamos o tamanho para 4 kg.",
    });
  });

  it("trocar o formato mantém o peso que já cabe, sem aviso", () => {
    expect(ajustarKgAoTrocarFormato(3, "redondo")).toEqual({ kg: 3, aviso: null });
    expect(ajustarKgAoTrocarFormato(4, "retangular")).toEqual({ kg: 4, aviso: null });
    expect(ajustarKgAoTrocarFormato(2, "redondo")).toEqual({ kg: 2, aviso: null });
  });
});

describe("Bolo — formato", () => {
  it("oferece redondo e retangular, nunca quadrado", () => {
    expect([...FORMATOS_BOLO]).toEqual(["redondo", "retangular"]);
    expect(FORMATO_BOLO_LABELS.retangular).toBe("Retangular");
  });

  it("registro antigo com quadrado continua válido e legível", () => {
    expect(formatoValido("redondo")).toBe(true);
    expect(formatoValido("retangular")).toBe(true);
    expect(formatoValido("quadrado")).toBe(true);
    expect(formatoValido("coração")).toBe(false);
    expect(FORMATO_BOLO_LABELS.quadrado).toBe("Quadrado");
  });

  it("pedido novo nunca sai como quadrado", () => {
    expect(formatoDoPedido("quadrado")).toBe("retangular");
    expect(formatoDoPedido("retangular")).toBe("retangular");
    expect(formatoDoPedido("redondo")).toBe("redondo");
  });

  it("detalhe mostra kg × R$/kg", () => {
    expect(detalheDoBolo(80, 3)).toBe("3 kg × R$ 80,00");
  });
});
