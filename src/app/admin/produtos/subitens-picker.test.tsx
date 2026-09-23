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
  it("escolhe no dropdown, adiciona e remove um subitem, gerando um input hidden por item", () => {
    const { container } = render(
      <SubitensPicker produtosDisponiveis={CANDIDATOS} initialSubitens={[]} nomeAtual="Cento de teste" />
    );

    const select = screen.getByRole("combobox", { name: /escolher produto/i });
    fireEvent.change(select, { target: { value: "Coxinha de frango" } });
    fireEvent.click(screen.getByRole("button", { name: /adicionar/i }));

    expect(screen.getByText("Coxinha de frango")).toBeInTheDocument();
    const hiddenInputs = container.querySelectorAll('input[name="subitem_nome"]');
    expect(hiddenInputs).toHaveLength(1);
    expect((hiddenInputs[0] as HTMLInputElement).value).toBe("Coxinha de frango");

    fireEvent.click(screen.getByRole("button", { name: /remover coxinha de frango da lista de subitens/i }));
    // Depois de removido, "Coxinha de frango" volta a existir como opção do
    // dropdown — a asserção certa é que ele não sobra na lista de
    // escolhidos (nenhum <li>), não que o texto suma da página inteira.
    expect(container.querySelectorAll("li")).toHaveLength(0);
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

  it("não lista o próprio produto em edição nem um subitem já adicionado como opção do dropdown", () => {
    render(
      <SubitensPicker
        produtosDisponiveis={[...CANDIDATOS, { nome: "Cento de teste", ativo: true }]}
        initialSubitens={["Risole de carne"]}
        nomeAtual="Cento de teste"
      />
    );

    const select = screen.getByRole("combobox", { name: /escolher produto/i });
    const opcoes = Array.from(select.querySelectorAll("option")).map((o) => o.value);

    expect(opcoes).not.toContain("Cento de teste");
    expect(opcoes).not.toContain("Risole de carne");
    expect(opcoes).toContain("Coxinha de frango");
  });

  it("mantém o botão Adicionar desabilitado sem nenhum produto selecionado no dropdown", () => {
    render(
      <SubitensPicker produtosDisponiveis={CANDIDATOS} initialSubitens={[]} nomeAtual="Cento de teste" />
    );

    expect(screen.getByRole("button", { name: /adicionar/i })).toBeDisabled();
  });
});
