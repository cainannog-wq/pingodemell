import { describe, expect, it } from "vitest";
import {
  detalheDoBolo,
  erroKg,
  formatoValido,
  KG_AVISO,
  KG_MAXIMO,
  kgValido,
  normalizarKg,
  passoKg,
  textoAvisoKg,
} from "./bolo";

describe("Bolo — tamanho em kg", () => {
  it("de 1 em 1 kg, do mínimo ao teto técnico", () => {
    expect(kgValido(1)).toBe(true);
    expect(kgValido(KG_MAXIMO)).toBe(true);
    expect(kgValido(0)).toBe(false);
    expect(kgValido(KG_MAXIMO + 1)).toBe(false);
    expect(kgValido(1.5)).toBe(false);
    expect(erroKg(1.5)).toBe("Use um número inteiro de quilos.");
    expect(erroKg(0)).toBe("Tamanho mínimo: 1 kg");
    expect(erroKg(2)).toBeNull();
  });

  it("acima de 10 kg só avisa; até 10 kg não avisa; o aviso não bloqueia", () => {
    expect(textoAvisoKg(KG_AVISO)).toBeNull();
    expect(textoAvisoKg(KG_AVISO + 1)).toMatch(/acima de 10 kg.*WhatsApp/);
    expect(erroKg(KG_AVISO + 1)).toBeNull();
  });

  it("normaliza e anda um quilo por clique, sem sair da faixa", () => {
    expect(normalizarKg(NaN)).toBe(1);
    expect(normalizarKg(-3)).toBe(1);
    expect(normalizarKg(2.9)).toBe(2);
    expect(normalizarKg(999)).toBe(KG_MAXIMO);
    expect(passoKg(1, -1)).toBe(1);
    expect(passoKg(1, 1)).toBe(2);
    expect(passoKg(KG_MAXIMO, 1)).toBe(KG_MAXIMO);
  });

  it("formato só redondo ou quadrado; detalhe mostra kg × R$/kg", () => {
    expect(formatoValido("redondo")).toBe(true);
    expect(formatoValido("quadrado")).toBe(true);
    expect(formatoValido("coração")).toBe(false);
    expect(detalheDoBolo(80, 3)).toBe("3 kg × R$ 80,00");
  });
});
