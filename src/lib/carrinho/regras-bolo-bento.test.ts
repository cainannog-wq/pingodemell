import { describe, expect, it } from "vitest";
import { adicionarLinha, escreverCarrinho, lerCarrinho, type LinhaCarrinho, type NovaLinha } from "./regras";

let seq = 0;
const novoId = () => `linha-${++seq}`;

const bolo = (kg: number, recheioId = "r-brigadeiro", observacao: string | null = null): NovaLinha => ({
  tipo: "bolo",
  produtoId: "p-bolo",
  slug: "bolo-de-chocolate",
  nome: "Bolo de Chocolate",
  preco: 80,
  quantidade: kg,
  recheio: { id: recheioId, nome: "Brigadeiro" },
  formato: "redondo",
  observacao,
});

const bento = (quantidade: number, recheioId = "r-ninho", observacao: string | null = null): NovaLinha => ({
  tipo: "bento",
  produtoId: "p-bento",
  slug: "bento-flork",
  nome: "Bento Cake Flork",
  preco: 60,
  quantidade,
  recheio: { id: recheioId, nome: "Ninho" },
  observacao,
});

const smash: NovaLinha = {
  tipo: "normal",
  produtoId: "p-smash",
  slug: "smash-cake",
  nome: "Smash Cake",
  preco: 70,
  unidade_venda: "unidade",
  quantidade: 1,
  observacao: null,
};

describe("carrinho — Bolo", () => {
  it("nunca junta: dois bolos iguais são duas linhas (2 kg + 2 kg não é 4 kg)", () => {
    let linhas = adicionarLinha([], bolo(2), novoId);
    linhas = adicionarLinha(linhas, bolo(2), novoId);
    expect(linhas).toHaveLength(2);
    expect(linhas.map((l) => l.quantidade)).toEqual([2, 2]);
  });

  it("preço da linha é o R$/kg do recheio: quantidade × preco é o preço do bolo (a conta do pedido)", () => {
    const [linha] = adicionarLinha([], bolo(3), novoId);
    expect(linha.quantidade * linha.preco).toBe(240);
  });
});

describe("carrinho — Bento Cake", () => {
  it("mesmo tema, mesmo recheio e mesma observação somam a quantidade", () => {
    let linhas = adicionarLinha([], bento(2), novoId);
    linhas = adicionarLinha(linhas, bento(3), novoId);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].quantidade).toBe(5);
  });

  it("recheio ou observação diferente vira outra linha", () => {
    let linhas = adicionarLinha([], bento(2), novoId);
    linhas = adicionarLinha(linhas, bento(2, "r-brigadeiro"), novoId);
    linhas = adicionarLinha(linhas, bento(2, "r-ninho", "topo de unicórnio"), novoId);
    expect(linhas).toHaveLength(3);
  });

  it("bento e bolo do mesmo recheio não se misturam", () => {
    let linhas = adicionarLinha([], bolo(1, "r-x"), novoId);
    linhas = adicionarLinha(linhas, bento(1, "r-x"), novoId);
    expect(linhas.map((l) => l.tipo)).toEqual(["bolo", "bento"]);
  });
});

describe("carrinho — Smash Cake", () => {
  it("é uma linha de avulso comum e soma como avulso", () => {
    let linhas = adicionarLinha([], smash, novoId);
    linhas = adicionarLinha(linhas, smash, novoId);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ tipo: "normal", quantidade: 2 });
  });
});

describe("carrinho — leitura do que está salvo (Bolo e Bento)", () => {
  const linhaBolo = { id: "a", produtoId: "p", slug: "s", nome: "Bolo", preco: 80, observacao: null, tipo: "bolo", quantidade: 2, recheio: { id: "r", nome: "Brigadeiro" }, formato: "quadrado" };
  const linhaBento = { id: "b", produtoId: "p2", slug: "s2", nome: "Bento", preco: 60, observacao: null, tipo: "bento", quantidade: 1, recheio: { id: "r2", nome: "Ninho" } };
  const salvar = (linhas: unknown[]) => JSON.stringify({ versao: 1, linhas });

  it("ida e volta mantém as duas linhas (mesma versão 1 do carrinho)", () => {
    const linhas = adicionarLinha(adicionarLinha([], bolo(2), novoId), bento(1), novoId);
    expect(lerCarrinho(escreverCarrinho(linhas))).toEqual(linhas);
  });

  it("aceita linhas válidas de Bolo e Bento", () => {
    expect(lerCarrinho(salvar([linhaBolo, linhaBento]))).toHaveLength(2);
  });

  it.each([
    ["Bolo sem recheio", { ...linhaBolo, recheio: null }],
    ["Bolo com recheio sem id", { ...linhaBolo, recheio: { nome: "X" } }],
    ["Bolo com formato desconhecido", { ...linhaBolo, formato: "coração" }],
    ["Bolo de 0 kg", { ...linhaBolo, quantidade: 0 }],
    ["Bolo de meio quilo", { ...linhaBolo, quantidade: 1.5 }],
    ["Bolo de 51 kg", { ...linhaBolo, quantidade: 51 }],
    ["Bento sem recheio", { ...linhaBento, recheio: undefined }],
    ["Bento com quantidade 0", { ...linhaBento, quantidade: 0 }],
    ["tipo desconhecido", { ...linhaBento, tipo: "smash" }],
  ])("descarta %s, sem quebrar as outras", (_nome, ruim) => {
    const lidas: LinhaCarrinho[] = lerCarrinho(salvar([ruim, linhaBolo]));
    expect(lidas.map((l) => l.id)).toEqual(["a"]);
  });
});

// Avulso com recheios personalizados (Ganache, Kit Kat...): o recheio escolhido
// vai na linha, é só informativo e separa as linhas.
describe("avulso com recheio personalizado", () => {
  const ganache = (quantidade: number, recheioId?: string): NovaLinha => ({
    tipo: "normal",
    produtoId: "p-ganache",
    slug: "bolo-ganache",
    nome: "Bolo Ganache",
    preco: 108,
    unidade_venda: "o kg",
    quantidade,
    observacao: null,
    ...(recheioId ? { recheio: { id: recheioId, nome: `Recheio ${recheioId}` } } : {}),
  });

  it("mesmo recheio soma; recheio diferente é outra linha; sem recheio não junta com recheio", () => {
    let linhas: LinhaCarrinho[] = [];
    linhas = adicionarLinha(linhas, ganache(1, "a"), novoId);
    linhas = adicionarLinha(linhas, ganache(2, "a"), novoId);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].quantidade).toBe(3);
    linhas = adicionarLinha(linhas, ganache(1, "b"), novoId);
    expect(linhas).toHaveLength(2);
    linhas = adicionarLinha(linhas, ganache(1), novoId);
    expect(linhas).toHaveLength(3);
  });

  it("o subtotal é preço fixo × quantidade; o recheio não muda o valor", () => {
    const [linha] = adicionarLinha([], ganache(2, "a"), novoId);
    expect(linha.preco * linha.quantidade).toBe(216);
  });

  it("sobrevive ao salvar e ler do navegador; recheio inválido descarta a linha", () => {
    const linhas = adicionarLinha([], ganache(1, "a"), novoId);
    expect(lerCarrinho(escreverCarrinho(linhas))).toEqual(linhas);
    const quebrada = JSON.stringify({ versao: 1, linhas: [{ ...linhas[0], recheio: { id: "a" } }] });
    expect(lerCarrinho(quebrada)).toEqual([]);
  });
});
