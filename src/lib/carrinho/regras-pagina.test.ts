import { describe, expect, it } from "vitest";
import {
  alterarQuantidade,
  assinaturaDaLinha,
  controleDaQuantidade,
  escreverCarrinho,
  lerCarrinho,
  limitesDaLinha,
  linhaParaEditar,
  linhaValida,
  passoNaLinha,
  podeEditarNaInterna,
  reinserirLinha,
  subtotalDaLinha,
  substituirLinha,
  totalDoCarrinho,
  type LinhaCarrinho,
} from "./regras";

// Regras da página do carrinho: quantidade travada pelo mínimo e pelo step
// gravados na linha, subtotal e total só com o que está gravado, e "Desfazer"
// devolvendo a linha ao lugar dela.

const base = { slug: "x", observacao: null, foto: null };

const brigadeiro = (quantidade: number, extra: Partial<Extract<LinhaCarrinho, { tipo: "normal" }>> = {}): LinhaCarrinho => ({
  ...base,
  id: "brigadeiro",
  produtoId: "p1",
  nome: "Brigadeiro",
  preco: 2.35,
  tipo: "normal",
  unidade_venda: "unidade",
  quantidade,
  pedidoMinimo: 10,
  step: "multiplos_5",
  ...extra,
});

const smash: LinhaCarrinho = {
  ...base,
  id: "smash",
  produtoId: "p2",
  nome: "Smash Cake",
  preco: 39.9,
  tipo: "normal",
  unidade_venda: "unidade",
  quantidade: 2,
  pedidoMinimo: 1,
  step: "livre",
};

const bento: LinhaCarrinho = {
  ...base,
  id: "bento",
  produtoId: "p3",
  nome: "Bento Cake Unicórnio",
  preco: 45,
  tipo: "bento",
  quantidade: 3,
  pedidoMinimo: 2,
  recheio: { id: "r1", nome: "Brigadeiro" },
};

const cento: LinhaCarrinho = {
  ...base,
  id: "cento",
  produtoId: "p4",
  nome: "Cento de salgados",
  preco: 95.99,
  tipo: "cento",
  quantidade: 2,
  sabores: [
    { nome: "Coxinha", quantidade: 120 },
    { nome: "Risole", quantidade: 80 },
  ],
};

const bolo: LinhaCarrinho = {
  ...base,
  id: "bolo",
  produtoId: "p5",
  nome: "Bolo",
  preco: 89.9,
  tipo: "bolo",
  quantidade: 12,
  recheio: { id: "r2", nome: "Ninho com morango" },
  formato: "redondo",
};

describe("carrinho — controle de quantidade por tipo", () => {
  it("Avulso, Smash Cake (avulso) e Bento Cake têm controle; Cento e Bolo não", () => {
    expect(controleDaQuantidade(brigadeiro(10))).toEqual({ minimo: 10, step: "multiplos_5" });
    expect(controleDaQuantidade(smash)).toEqual({ minimo: 1, step: "livre" });
    expect(controleDaQuantidade(bento)).toEqual({ minimo: 2, step: "livre" });
    expect(controleDaQuantidade(cento)).toBeNull();
    expect(controleDaQuantidade(bolo)).toBeNull();
  });

  it("linha sem mínimo ou step gravados (antiga) não tem controle: só remover", () => {
    const antiga = { ...brigadeiro(10) } as Record<string, unknown>;
    delete antiga.pedidoMinimo;
    delete antiga.step;
    expect(controleDaQuantidade(antiga as LinhaCarrinho)).toBeNull();
    expect(limitesDaLinha(antiga as LinhaCarrinho)).toBeNull();
    // e alterar a quantidade não muda nada
    expect(alterarQuantidade([antiga as LinhaCarrinho], "brigadeiro", 50)[0].quantidade).toBe(10);
  });

  it("Cento e Bolo não mudam de quantidade nem por chamada direta", () => {
    expect(alterarQuantidade([cento, bolo], "cento", 5).map((l) => l.quantidade)).toEqual([2, 12]);
    expect(alterarQuantidade([cento, bolo], "bolo", 1).map((l) => l.quantidade)).toEqual([2, 12]);
  });
});

describe("carrinho — quantidade respeita o mínimo e o step gravados", () => {
  it("trava no mínimo: limites e passo para baixo", () => {
    const l = brigadeiro(10);
    expect(limitesDaLinha(l)).toMatchObject({ minimo: 10, podeMenos: false, podeMais: true });
    expect(passoNaLinha(l, -1)).toBe(10);
    expect(passoNaLinha(l, 1)).toBe(15);
  });

  it("valor fora da regra vai para o aceito mais próximo (mínimo e múltiplo do step)", () => {
    expect(alterarQuantidade([brigadeiro(20)], "brigadeiro", 3)[0].quantidade).toBe(10);
    expect(alterarQuantidade([brigadeiro(20)], "brigadeiro", 32)[0].quantidade).toBe(35);
    expect(alterarQuantidade([brigadeiro(20)], "brigadeiro", 25)[0].quantidade).toBe(25);
  });

  it("mínimo que não bate com o step sobe até o múltiplo (12 em múltiplos de 5 = 15)", () => {
    const l = brigadeiro(15, { pedidoMinimo: 12 });
    expect(limitesDaLinha(l)).toMatchObject({ minimo: 15, podeMenos: false });
  });

  it("Smash Cake anda de 1 em 1; Bento Cake respeita o mínimo do produto, sem step", () => {
    expect(passoNaLinha(smash, 1)).toBe(3);
    expect(passoNaLinha(smash, -1)).toBe(1);
    expect(limitesDaLinha({ ...bento, quantidade: 2 })).toMatchObject({ minimo: 2, podeMenos: false });
    expect(alterarQuantidade([bento], "bento", 1)[0].quantidade).toBe(2);
    expect(alterarQuantidade([bento], "bento", 7)[0].quantidade).toBe(7);
  });

  it("só a linha pedida muda, o resto fica igual", () => {
    const antes = [brigadeiro(10), smash, cento];
    const depois = alterarQuantidade(antes, "smash", 5);
    expect(depois[0]).toBe(antes[0]);
    expect(depois[2]).toBe(antes[2]);
    expect(depois[1].quantidade).toBe(5);
  });
});

describe("carrinho — subtotal e total (só o que está gravado)", () => {
  it("avulso e Bento = preço × unidades; Cento = preço × centos; Bolo = R$/kg × kg", () => {
    expect(subtotalDaLinha(brigadeiro(10))).toBe(23.5);
    expect(subtotalDaLinha(bento)).toBe(135);
    expect(subtotalDaLinha(cento)).toBe(191.98);
    expect(subtotalDaLinha(bolo)).toBe(1078.8);
  });

  it("total é a soma das linhas, sem erro de ponto flutuante", () => {
    expect(totalDoCarrinho([])).toBe(0);
    expect(totalDoCarrinho([brigadeiro(10), smash, bento, cento, bolo])).toBe(1509.08);
    // 0,1 + 0,2 não vira 0,30000000000000004
    const a = { ...smash, id: "a", preco: 0.1, quantidade: 1 } as LinhaCarrinho;
    const b = { ...smash, id: "b", preco: 0.2, quantidade: 1 } as LinhaCarrinho;
    expect(totalDoCarrinho([a, b])).toBe(0.3);
  });

  it("muda junto com a quantidade, a remoção e o desfazer", () => {
    const linhas = [brigadeiro(10), smash];
    const depois = alterarQuantidade(linhas, "smash", 4);
    expect(totalDoCarrinho(depois)).toBe(183.1);
    expect(totalDoCarrinho(depois.filter((l) => l.id !== "brigadeiro"))).toBe(159.6);
  });
});

describe("carrinho — desfazer remoção volta a linha ao lugar", () => {
  const ordem = ["brigadeiro", "smash", "bento", "cento"];
  const todas = [brigadeiro(10), smash, bento, cento];

  it("volta na mesma posição, idêntica", () => {
    const sem = todas.filter((l) => l.id !== "bento");
    const volta = reinserirLinha(sem, bento, ordem);
    expect(volta).toEqual(todas);
    expect(volta[2]).toBe(bento);
  });

  it("primeira e última posição", () => {
    expect(reinserirLinha(todas.slice(1), todas[0], ordem)).toEqual(todas);
    expect(reinserirLinha(todas.slice(0, 3), todas[3], ordem)).toEqual(todas);
  });

  it("com outras linhas removidas no meio, respeita a ordem original", () => {
    // tirou 'smash' e depois 'bento': desfazer o 'bento' primeiro e o 'smash' depois
    const semAmbos = [todas[0], todas[3]];
    const comBento = reinserirLinha(semAmbos, bento, ordem);
    expect(comBento.map((l) => l.id)).toEqual(["brigadeiro", "bento", "cento"]);
    const comSmash = reinserirLinha(comBento, smash, ordem);
    expect(comSmash.map((l) => l.id)).toEqual(["brigadeiro", "smash", "bento", "cento"]);
  });

  it("linha que já está na lista não duplica", () => {
    expect(reinserirLinha(todas, bento, ordem)).toEqual(todas);
  });
});

describe("carrinho — linhas gravadas com os campos novos", () => {
  it("valida e lê de volta pedidoMinimo, step e foto", () => {
    const linhas = [brigadeiro(10, { foto: "https://x.supabase.co/storage/v1/object/public/a.webp" }), bento];
    expect(lerCarrinho(escreverCarrinho(linhas))).toEqual(linhas);
  });

  it("descarta a linha com valor inválido nos campos novos", () => {
    expect(linhaValida({ ...brigadeiro(10), pedidoMinimo: 0 })).toBe(false);
    expect(linhaValida({ ...brigadeiro(10), pedidoMinimo: 2.5 })).toBe(false);
    expect(linhaValida({ ...brigadeiro(10), step: "multiplos_7" })).toBe(false);
    expect(linhaValida({ ...bento, pedidoMinimo: -1 })).toBe(false);
    expect(linhaValida({ ...smash, foto: 42 })).toBe(false);
  });

  it("linha da v1 sem os campos novos continua válida", () => {
    const antiga = { ...brigadeiro(10) } as Record<string, unknown>;
    delete antiga.pedidoMinimo;
    delete antiga.step;
    delete antiga.foto;
    expect(linhaValida(antiga)).toBe(true);
  });
});

describe("carrinho — editar Cento e Bolo (troca de um por um)", () => {
  const lista = [brigadeiro(10), cento, bolo, smash, bento];

  it("só Cento e Bolo com slug têm editar", () => {
    expect(podeEditarNaInterna({ ...cento, slug: "cento-de-salgados" })).toBe(true);
    expect(podeEditarNaInterna({ ...bolo, slug: "bolo" })).toBe(true);
    expect(podeEditarNaInterna({ ...bolo, slug: null })).toBe(false);
    expect(podeEditarNaInterna(brigadeiro(10))).toBe(false);
    expect(podeEditarNaInterna(smash)).toBe(false);
    expect(podeEditarNaInterna(bento)).toBe(false);
  });

  it("o vínculo vale só para linha existente, do mesmo produto e do mesmo tipo", () => {
    expect(linhaParaEditar(lista, "cento", "p4", "cento")).toBe(cento);
    expect(linhaParaEditar(lista, "bolo", "p5", "bolo")).toBe(bolo);
    expect(linhaParaEditar(lista, "nao-existe", "p4", "cento")).toBeNull();
    expect(linhaParaEditar(lista, "cento", "outro-produto", "cento")).toBeNull();
    expect(linhaParaEditar(lista, "cento", "p4", "bolo")).toBeNull();
    expect(linhaParaEditar(lista, "smash", "p2", "cento")).toBeNull();
    expect(linhaParaEditar(lista, "bento", "p3", "bolo")).toBeNull();
  });

  it("troca na mesma posição, mantém o id e não muda o tamanho da lista", () => {
    const editada = { ...bolo, quantidade: 4, formato: "quadrado" as const, observacao: "sem topo" };
    const depois = substituirLinha(lista, "bolo", { ...editada, id: "qualquer-outro" });
    expect(depois).toHaveLength(lista.length);
    expect(depois.map((l) => l.id)).toEqual(lista.map((l) => l.id));
    expect(depois[2]).toEqual({ ...editada, id: "bolo" });
    expect(depois[0]).toBe(lista[0]);
    expect(depois[4]).toBe(lista[4]);
  });

  it("não junta com outra linha, mesmo que a composição fique idêntica à de outro Cento", () => {
    const outro: LinhaCarrinho = { ...cento, id: "cento-2", quantidade: 1, sabores: [{ nome: "Coxinha", quantidade: 100 }] };
    const editada: LinhaCarrinho = { ...cento, quantidade: 1, sabores: [{ nome: "Coxinha", quantidade: 100 }] };
    const depois = substituirLinha([cento, outro], "cento", editada);
    expect(depois).toHaveLength(2);
    expect(depois.map((l) => l.id)).toEqual(["cento", "cento-2"]);
    expect(depois[0]).toEqual({ ...editada, id: "cento" });
    expect(depois[1]).toBe(outro);
  });

  it("id inexistente, produto ou tipo diferente e linha inválida devolvem a lista como estava", () => {
    expect(substituirLinha(lista, "nao-existe", bolo)).toBe(lista);
    expect(substituirLinha(lista, "bolo", { ...bolo, produtoId: "outro" })).toBe(lista);
    expect(substituirLinha(lista, "bolo", { ...cento, id: "bolo" })).toBe(lista);
    expect(substituirLinha(lista, "bolo", { ...bolo, quantidade: 0 })).toBe(lista);
    expect(substituirLinha(lista, "bolo", { ...bolo, quantidade: 51 })).toBe(lista);
  });

  it("a assinatura muda quando a linha muda", () => {
    expect(assinaturaDaLinha(bolo)).toBe(assinaturaDaLinha({ ...bolo }));
    expect(assinaturaDaLinha(bolo)).not.toBe(assinaturaDaLinha({ ...bolo, quantidade: 13 }));
  });
});
