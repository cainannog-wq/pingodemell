// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PriceInput } from "./PriceInput";

// Achado da auditoria de acessibilidade de 22/09/2026: editar um dígito
// no meio do valor jogava o cursor pro fim a cada tecla, porque o React
// troca o `value` inteiro (recalculado do zero) sem preservar a posição.
//
// fireEvent.change(input, { target: { value, selectionStart, selectionEnd } })
// é o jeito correto de simular isso: passar o valor direto por
// `input.value = ...` não dispara o onChange do React de verdade (o
// tracker interno do React já vê o valor "novo" como se fosse o que ele
// mesmo tinha acabado de setar, e o handler nunca roda).
describe("PriceInput — posição do cursor ao editar no meio do valor", () => {
  afterEach(cleanup);

  it("mantém o cursor logo depois do dígito digitado, não no fim da string", () => {
    render(<PriceInput name="preco" defaultValue={1234.56} required />);
    const input = screen.getByPlaceholderText("R$ 0,00") as HTMLInputElement;

    expect(input.value).toBe("R$ 1.234,56");

    // Simula o usuário clicando entre "1" e "2" (posição 4, logo depois
    // de "R$ 1") e digitando "9": o navegador já teria inserido o "9" e
    // posicionado o cursor logo depois dele (posição 5) antes do nosso
    // onChange rodar.
    fireEvent.change(input, { target: { value: "R$ 19.234,56", selectionStart: 5, selectionEnd: 5 } });

    expect(input.value).toBe("R$ 19.234,56");
    // Se o bug estivesse presente, o cursor estaria no fim (posição 12),
    // não logo depois do "9" digitado (posição 5).
    expect(input.selectionStart).toBe(5);
    expect(input.selectionEnd).toBe(5);
  });

  it("mantém o cursor no início ao apagar o primeiro dígito", () => {
    render(<PriceInput name="preco" defaultValue={1234.56} required />);
    const input = screen.getByPlaceholderText("R$ 0,00") as HTMLInputElement;

    // Apaga o "1" inicial (Backspace na posição 4, logo depois de "R$ ").
    fireEvent.change(input, { target: { value: "R$ .234,56", selectionStart: 3, selectionEnd: 3 } });

    expect(input.value).toBe("R$ 234,56");
    expect(input.selectionStart).toBe(3);
  });

  it("continua digitando no fim normalmente (caso comum, sem edição no meio)", () => {
    render(<PriceInput name="preco" defaultValue={1.23} required />);
    const input = screen.getByPlaceholderText("R$ 0,00") as HTMLInputElement;

    expect(input.value).toBe("R$ 1,23");

    // Digita mais um dígito no fim do valor.
    fireEvent.change(input, { target: { value: "R$ 1,239", selectionStart: 8, selectionEnd: 8 } });

    expect(input.value).toBe("R$ 12,39");
    expect(input.selectionStart).toBe(input.value.length);
  });
});
