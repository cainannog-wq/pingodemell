import { describe, expect, it } from "vitest";
import {
  adicionarLinha,
  alterarLinha,
  contarItens,
  escreverCarrinho,
  lerCarrinho,
  MAX_LINHAS,
  normalizarObservacao,
  OBSERVACAO_MAX,
  removerLinha,
  type LinhaCarrinho,
  type NovaLinha,
} from "./regras";

let seq = 0;
const novoId = () => `linha-${++seq}`;

const brigadeiro = (quantidade: number, observacao: string | null = null): NovaLinha => ({
  tipo: "normal",
  produtoId: "p-brigadeiro",
  slug: "brigadeiro-gourmet",
  nome: "Brigadeiro Gourmet",
  preco: 2.35,
  unidade_venda: null,
  quantidade,
  observacao,
});

const cento = (quantidade: number, sabores: [string, number][], observacao: string | null = null): NovaLinha => ({
  tipo: "cento",
  produtoId: "p-cento",
  slug: "cento-de-salgados-sortidos",
  nome: "Cento de salgados sortidos",
  preco: 95.99,
  quantidade,
  sabores: sabores.map(([nome, q]) => ({ nome, quantidade: q })),
  observacao,
});

describe("carrinho — adicionar", () => {
  it("avulso igual (mesmo produto e observação) soma na mesma linha; contador conta linhas", () => {
    let linhas = adicionarLinha([], brigadeiro(30), novoId);
    linhas = adicionarLinha(linhas, brigadeiro(10), novoId);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].quantidade).toBe(40);
    expect(contarItens(linhas)).toBe(1);
  });

  it("observação diferente vira outra linha", () => {
    let linhas = adicionarLinha([], brigadeiro(30), novoId);
    linhas = adicionarLinha(linhas, brigadeiro(30, "forminha rosa"), novoId);
    expect(contarItens(linhas)).toBe(2);
    expect(linhas[1].observacao).toBe("forminha rosa");
  });

  it("Cento junta só com a mesma combinação por cento", () => {
    let linhas = adicionarLinha([], cento(1, [["Risole", 60], ["Empada", 40]]), novoId);
    linhas = adicionarLinha(linhas, cento(2, [["Risole", 120], ["Empada", 80]]), novoId);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ quantidade: 3, sabores: [{ nome: "Risole", quantidade: 180 }, { nome: "Empada", quantidade: 120 }] });
    linhas = adicionarLinha(linhas, cento(1, [["Risole", 50], ["Empada", 50]]), novoId);
    expect(linhas).toHaveLength(2);
  });

  it("observação: limpa espaços, vazia vira null, corta no máximo", () => {
    expect(normalizarObservacao("   ")).toBeNull();
    expect(normalizarObservacao("  sem cebola ")).toBe("sem cebola");
    expect(normalizarObservacao("x".repeat(OBSERVACAO_MAX + 50))).toHaveLength(OBSERVACAO_MAX);
  });

  it("não passa do máximo de linhas", () => {
    let linhas: LinhaCarrinho[] = [];
    for (let i = 0; i < MAX_LINHAS + 5; i++) linhas = adicionarLinha(linhas, brigadeiro(1, `obs ${i}`), novoId);
    expect(linhas).toHaveLength(MAX_LINHAS);
  });
});

describe("carrinho — alterar, remover e o que fica salvo no navegador", () => {
  it("remove e altera pela linha; alteração inválida é ignorada", () => {
    let linhas = adicionarLinha([], brigadeiro(30), novoId);
    linhas = adicionarLinha(linhas, cento(1, [["Risole", 100]]), novoId);
    const [a, b] = linhas;
    expect(removerLinha(linhas, a.id)).toEqual([b]);
    expect(alterarLinha(linhas, a.id, { ...a, quantidade: 50 } as LinhaCarrinho)[0].quantidade).toBe(50);
    expect(alterarLinha(linhas, b.id, { ...b, sabores: [{ nome: "Risole", quantidade: 90 }] } as LinhaCarrinho)).toBe(linhas);
  });

  it("ida e volta pelo texto salvo", () => {
    let linhas = adicionarLinha([], brigadeiro(30, "forminha rosa"), novoId);
    linhas = adicionarLinha(linhas, cento(2, [["Risole", 120], ["Empada", 80]]), novoId);
    expect(lerCarrinho(escreverCarrinho(linhas))).toEqual(linhas);
  });

  it("texto corrompido, de outra versão ou mexido à mão não quebra: linha inválida sai", () => {
    expect(lerCarrinho(null)).toEqual([]);
    expect(lerCarrinho("{nada")).toEqual([]);
    expect(lerCarrinho(JSON.stringify({ versao: 99, linhas: [] }))).toEqual([]);
    const boa = adicionarLinha([], brigadeiro(30), novoId)[0];
    const ruins = [
      { ...boa, quantidade: 0 },
      { ...boa, quantidade: 1.5 },
      { ...boa, preco: -1 },
      { ...boa, tipo: "outro" },
      { id: "x", tipo: "cento", produtoId: "c", slug: null, nome: "C", preco: 1, observacao: null, quantidade: 1, sabores: [{ nome: "A", quantidade: 70 }] },
      { id: "y", tipo: "cento", produtoId: "c", slug: null, nome: "C", preco: 1, observacao: null, quantidade: 1, sabores: [{ nome: "A", quantidade: 52 }, { nome: "B", quantidade: 48 }] },
      // Passo de 10 desde o PR cento/passo-10: 55 e 45 (o antigo passo 5) saem.
      { id: "z", tipo: "cento", produtoId: "c", slug: null, nome: "C", preco: 1, observacao: null, quantidade: 1, sabores: [{ nome: "A", quantidade: 55 }, { nome: "B", quantidade: 45 }] },
      "texto",
      null,
    ];
    expect(lerCarrinho(JSON.stringify({ versao: 1, linhas: [boa, ...ruins] }))).toEqual([boa]);
    const cento10 = { id: "w", tipo: "cento", produtoId: "c", slug: null, nome: "C", preco: 1, observacao: null, quantidade: 2, sabores: [{ nome: "A", quantidade: 120 }, { nome: "B", quantidade: 80 }] };
    expect(lerCarrinho(JSON.stringify({ versao: 1, linhas: [cento10] }))).toEqual([cento10]);
  });
});
