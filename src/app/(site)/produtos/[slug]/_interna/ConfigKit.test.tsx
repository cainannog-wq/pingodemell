// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LinhaCarrinho } from "@/lib/carrinho/regras";
import { configDoExemplo, PRODUTO } from "@/lib/kit/fixtura";
import type { ProdutoVitrine } from "@/lib/vitrine/mais-pedidos";

// Tela do kit por pessoa: tamanhos, escolha única, distribuição com passo e
// máximo de sabores, e o botão que só liga com tudo fechado. jsdom não é um
// navegador real; a conferência no navegador é da homologação.

const adicionar = vi.fn();
const push = vi.fn();
let linhasDoCarrinho: LinhaCarrinho[] = [];
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/components/site/CarrinhoProvider", () => ({
  useCarrinho: () => ({ linhas: linhasDoCarrinho, adicionar, substituir: vi.fn() }),
}));
vi.mock("@/components/site/analitica/Analitica", () => ({}));

const { ConfigKit } = await import("./ConfigKit");

const produto = {
  id: PRODUTO,
  slug: "kit-festa-basico",
  nome: "Kit Festa Básico",
  preco: 22,
  image_url: null,
} as unknown as ProdutoVitrine;
const config = configDoExemplo();

beforeEach(() => {
  adicionar.mockClear();
  push.mockClear();
  linhasDoCarrinho = [];
});
afterEach(() => cleanup());

const botaoAdicionar = () => screen.getAllByRole("button", { name: /Adicionar/ })[0];
const aumentar = (nome: RegExp) => fireEvent.click(screen.getByRole("button", { name: nome }));

describe("ConfigKit", () => {
  it("abre no menor tamanho, com o botão desligado e o primeiro problema explicado", () => {
    render(<ConfigKit produto={produto} config={config} />);
    expect(screen.getByLabelText("10 pessoas")).toBeChecked();
    expect(botaoAdicionar()).toBeDisabled();
    expect(screen.getAllByText(/Recheio do bolo: escolha uma opção/).length).toBeGreaterThan(0);
    expect(screen.getByText("R$ 220,00", { selector: ".interna-resumo-valor" })).toBeInTheDocument();
  });

  it("fecha a composição e adiciona ao carrinho com os pares de ids e o retrato", () => {
    render(<ConfigKit produto={produto} config={config} />);
    fireEvent.click(screen.getByLabelText(/Ninho com morango/));
    fireEvent.click(screen.getByLabelText(/Suco de uva/));
    // Doces: 20 unidades no passo de 10 = duas vezes + em dois sabores.
    aumentar(/Aumentar Doces, Brigadeiro/);
    expect(botaoAdicionar()).toBeDisabled();
    aumentar(/Aumentar Doces, Beijinho/);
    expect(screen.getByText("20 de 20 selecionados")).toBeInTheDocument();
    expect(botaoAdicionar()).toBeEnabled();
    fireEvent.click(botaoAdicionar());
    expect(adicionar).toHaveBeenCalledTimes(1);
    const linha = adicionar.mock.calls[0][0];
    expect(linha).toMatchObject({ tipo: "kit", quantidade: 10, preco: 22, unidade_venda: "a pessoa" });
    expect(Object.keys(linha.escolhas).sort()).toEqual(["bebida", "bolo", "doces"]);
    expect(linha.retrato.pessoas).toBe(10);
    expect(push).toHaveBeenCalledWith("/carrinho");
  });

  it("trocar as pessoas zera a distribuição e avisa; o preço acompanha", () => {
    render(<ConfigKit produto={produto} config={config} />);
    fireEvent.click(screen.getByLabelText(/Ninho com morango/));
    fireEvent.click(screen.getByLabelText(/Suco de uva/));
    aumentar(/Aumentar Doces, Brigadeiro/);
    fireEvent.click(screen.getByLabelText("20 pessoas"));
    expect(screen.getAllByText("0 de 40 selecionados").length).toBeGreaterThan(0);
    expect(screen.getByText(/refaça a escolha/)).toBeInTheDocument();
    expect(screen.getByText("R$ 440,00", { selector: ".interna-resumo-valor" })).toBeInTheDocument();
  });

  it("máximo de sabores: com 3 já usados, o quarto não aumenta", () => {
    render(<ConfigKit produto={produto} config={config} />);
    fireEvent.click(screen.getByLabelText("30 pessoas"));
    fireEvent.click(screen.getByRole("button", { name: /^Doces/ })); // abre o grupo à mão
    aumentar(/Aumentar Doces, Brigadeiro/);
    aumentar(/Aumentar Doces, Beijinho/);
    aumentar(/Aumentar Doces, Cajuzinho/);
    expect(screen.getByRole("button", { name: /Aumentar Doces, Olho de sogra/ })).toBeDisabled();
  });

  it("prévia do admin: tudo funciona, mas o botão fica desligado mesmo com o kit fechado", () => {
    render(<ConfigKit produto={produto} config={config} previa />);
    fireEvent.click(screen.getByLabelText(/Ninho com morango/));
    fireEvent.click(screen.getByLabelText(/Suco de uva/));
    aumentar(/Aumentar Doces, Brigadeiro/);
    aumentar(/Aumentar Doces, Beijinho/);
    expect(screen.getByText("20 de 20 selecionados")).toBeInTheDocument();
    expect(botaoAdicionar()).toBeDisabled();
    expect(screen.getAllByText(/Prévia do admin: este kit está inativo/).length).toBeGreaterThan(0);
    fireEvent.click(botaoAdicionar());
    expect(adicionar).not.toHaveBeenCalled();
  });

  it("com 5 kits no carrinho o botão fica desligado e o aviso do limite aparece", () => {
    linhasDoCarrinho = Array.from({ length: 5 }, (_, i) => ({ id: `k${i}`, tipo: "kit" }) as unknown as LinhaCarrinho);
    render(<ConfigKit produto={produto} config={config} />);
    expect(botaoAdicionar()).toBeDisabled();
    expect(screen.getAllByText(/Cada pedido aceita até 5 kits/).length).toBeGreaterThan(0);
  });

  describe("acordeão dos grupos", () => {
    const botaoDoGrupo = (nome: RegExp) => screen.getByRole("button", { name: nome, expanded: undefined });
    const abertoDoGrupo = (nome: RegExp) => botaoDoGrupo(nome).getAttribute("aria-expanded");

    it("abre só o primeiro grupo que falta; os outros ficam fechados", () => {
      render(<ConfigKit produto={produto} config={config} />);
      expect(abertoDoGrupo(/^Recheio do bolo/)).toBe("true");
      expect(abertoDoGrupo(/Bebida/)).toBe("false");
      expect(abertoDoGrupo(/Doces/)).toBe("false");
    });

    it("escolher o recheio fecha o grupo, mostra o resumo e abre o próximo que falta (na ordem da tela)", () => {
      render(<ConfigKit produto={produto} config={config} />);
      fireEvent.click(screen.getByLabelText(/Ninho com morango/));
      expect(abertoDoGrupo(/^Recheio do bolo/)).toBe("false");
      expect(botaoDoGrupo(/^Recheio do bolo/)).toHaveTextContent("Ninho com morango");
      // A ordem é a da configuração: recheio, doces, bebida.
      expect(abertoDoGrupo(/^Doces/)).toBe("true");
      expect(abertoDoGrupo(/^Bebida/)).toBe("false");
    });

    it("preencher um grupo de baixo leva de volta ao que ainda falta", () => {
      render(<ConfigKit produto={produto} config={config} />);
      fireEvent.click(screen.getByLabelText(/Suco de uva/));
      expect(abertoDoGrupo(/^Bebida/)).toBe("false");
      expect(abertoDoGrupo(/^Recheio do bolo/)).toBe("true");
    });

    it("fechar a soma de doces fecha o grupo; tudo completo deixa tudo recolhido", () => {
      render(<ConfigKit produto={produto} config={config} />);
      fireEvent.click(screen.getByLabelText(/Ninho com morango/));
      aumentar(/Aumentar Doces, Brigadeiro/);
      expect(abertoDoGrupo(/^Doces/)).toBe("true");
      aumentar(/Aumentar Doces, Beijinho/);
      expect(abertoDoGrupo(/^Doces/)).toBe("false");
      expect(abertoDoGrupo(/^Bebida/)).toBe("true");
      fireEvent.click(screen.getByLabelText(/Suco de uva/));
      expect(abertoDoGrupo(/^Bebida/)).toBe("false");
      expect(botaoAdicionar()).toBeEnabled();
    });

    it("o título abre um grupo fechado à mão, sem perder a escolha", () => {
      render(<ConfigKit produto={produto} config={config} />);
      fireEvent.click(screen.getByLabelText(/Ninho com morango/));
      fireEvent.click(botaoDoGrupo(/^Recheio do bolo/));
      expect(abertoDoGrupo(/^Recheio do bolo/)).toBe("true");
      expect(screen.getByLabelText(/Ninho com morango/)).toBeChecked();
    });
  });
});
