// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SubitensPicker } from "./subitens-picker";

const CANDIDATOS = [
  { nome: "Coxinha de frango", ativo: true },
  { nome: "Risole de carne", ativo: true },
  { nome: "Empada de palmito", ativo: false },
];

afterEach(() => cleanup());

describe("SubitensPicker", () => {
  it("busca, adiciona e remove um subitem, gerando um input hidden por item", () => {
    const { container } = render(
      <SubitensPicker produtosDisponiveis={CANDIDATOS} initialSubitens={[]} nomeAtual="Cento de teste" />
    );

    fireEvent.change(screen.getByPlaceholderText(/buscar produto/i), { target: { value: "Coxinha" } });
    fireEvent.click(screen.getByRole("button", { name: "Coxinha de frango" }));

    expect(screen.getByText("Coxinha de frango")).toBeInTheDocument();
    const hiddenInputs = container.querySelectorAll('input[name="subitem_nome"]');
    expect(hiddenInputs).toHaveLength(1);
    expect((hiddenInputs[0] as HTMLInputElement).value).toBe("Coxinha de frango");

    fireEvent.click(screen.getByRole("button", { name: /remover coxinha de frango da lista de subitens/i }));
    expect(screen.queryByText("Coxinha de frango")).not.toBeInTheDocument();
    expect(container.querySelectorAll('input[name="subitem_nome"]')).toHaveLength(0);
  });

  it("mostra o aviso 'produto inativo' junto de um subitem já adicionado cujo produto foi desativado", () => {
    render(
      <SubitensPicker
        produtosDisponiveis={CANDIDATOS}
        initialSubitens={["Empada de palmito"]}
        nomeAtual="Cento de teste"
      />
    );

    expect(screen.getByText("Empada de palmito")).toBeInTheDocument();
    expect(screen.getByText("Produto inativo")).toBeInTheDocument();
  });

  it("não lista o próprio produto em edição nem um subitem já adicionado como opção de busca", () => {
    render(
      <SubitensPicker
        produtosDisponiveis={[...CANDIDATOS, { nome: "Cento de teste", ativo: true }]}
        initialSubitens={["Risole de carne"]}
        nomeAtual="Cento de teste"
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/buscar produto/i), { target: { value: "" } });
    fireEvent.change(screen.getByPlaceholderText(/buscar produto/i), { target: { value: "e" } });

    expect(screen.queryByRole("button", { name: "Cento de teste" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Risole de carne" })).not.toBeInTheDocument();
  });
});
