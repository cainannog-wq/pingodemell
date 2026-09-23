import { describe, expect, it } from "vitest";
import { formatarPrecoVitrine, selecionarMaisPedidos, type ProdutoVitrine } from "./mais-pedidos";

// Dado simulado: nenhum destes testes lê ou altera o banco.
let seq = 0;
function produto(parcial: Partial<ProdutoVitrine>): ProdutoVitrine {
  seq += 1;
  return {
    id: `id-${seq}`,
    nome: `Produto ${seq}`,
    descricao: null,
    preco: 10,
    image_url: null,
    Categoria: "Doces",
    tipo: "normal",
    ativo: true,
    destaque: true,
    atualizado_em: "2026-09-23T14:29:18.070Z",
    ...parcial,
  };
}

const nomes = (lista: ProdutoVitrine[]) => lista.map((p) => p.nome);

describe("Os mais pedidos — filtro", () => {
  it("deixa de fora produto inativo, mesmo com destaque ligado", () => {
    const lista = [
      produto({ nome: "Beijinho inativo", ativo: false, destaque: true }),
      produto({ nome: "Brigadeiro ativo", ativo: true, destaque: true }),
    ];
    expect(nomes(selecionarMaisPedidos(lista))).toEqual(["Brigadeiro ativo"]);
  });

  it("deixa de fora bebida, mesmo ativa e com destaque", () => {
    const lista = [
      produto({ nome: "Coca-cola 2L", Categoria: "Bebidas" }),
      produto({ nome: "Bolo de chocolate", Categoria: "Bolos" }),
    ];
    expect(nomes(selecionarMaisPedidos(lista))).toEqual(["Bolo de chocolate"]);
  });

  it("mostra produto sem categoria (conta como não bebida) quando ativo e em destaque", () => {
    const lista = [produto({ nome: "Kit sem categoria", Categoria: null })];
    expect(nomes(selecionarMaisPedidos(lista))).toEqual(["Kit sem categoria"]);
  });

  it("deixa de fora produto ativo sem destaque", () => {
    const lista = [produto({ nome: "Empada", destaque: false })];
    expect(selecionarMaisPedidos(lista)).toEqual([]);
  });

  it("aceita bolo, doce e salgado ativos com destaque", () => {
    const lista = [
      produto({ nome: "A bolo", Categoria: "Bolos" }),
      produto({ nome: "B doce", Categoria: "Doces" }),
      produto({ nome: "C salgado", Categoria: "Salgados" }),
    ];
    expect(nomes(selecionarMaisPedidos(lista))).toEqual(["A bolo", "B doce", "C salgado"]);
  });

  it("retorna lista vazia quando nenhum produto se encaixa (a seção some)", () => {
    const lista = [
      produto({ ativo: false }),
      produto({ Categoria: "Bebidas" }),
      produto({ destaque: false }),
    ];
    expect(selecionarMaisPedidos(lista)).toEqual([]);
    expect(selecionarMaisPedidos([])).toEqual([]);
  });
});

describe("Os mais pedidos — limite e ordem", () => {
  it("mostra no máximo 10 produtos, mantendo os 10 editados mais recentemente", () => {
    const lista = Array.from({ length: 13 }, (_, i) =>
      produto({ nome: `P${String(i).padStart(2, "0")}`, atualizado_em: new Date(Date.UTC(2026, 8, 23, 10, i)).toISOString() })
    );
    const resultado = selecionarMaisPedidos(lista);
    expect(resultado).toHaveLength(10);
    // P12 é o mais recente; P00, P01 e P02 (os mais antigos) ficam de fora.
    expect(resultado[0].nome).toBe("P12");
    expect(nomes(resultado)).not.toContain("P00");
    expect(nomes(resultado)).not.toContain("P02");
    expect(nomes(resultado)).toContain("P03");
  });

  it("ordena do editado mais recentemente pro mais antigo (atualizado_em)", () => {
    const lista = [
      produto({ nome: "Antigo", atualizado_em: "2026-09-20T10:00:00Z" }),
      produto({ nome: "Recente", atualizado_em: "2026-09-23T14:38:07Z" }),
      produto({ nome: "Meio", atualizado_em: "2026-09-22T09:00:00Z" }),
    ];
    expect(nomes(selecionarMaisPedidos(lista))).toEqual(["Recente", "Meio", "Antigo"]);
  });

  it("desempata pelo nome quando atualizado_em é igual (ex.: produtos da migração)", () => {
    const mesmaHora = "2026-09-23T14:29:18.070Z";
    const lista = [
      produto({ nome: "Morango Banhado", atualizado_em: mesmaHora }),
      produto({ nome: "Beijinho", atualizado_em: mesmaHora }),
      produto({ nome: "Cento de docinho", atualizado_em: mesmaHora }),
      produto({ nome: "Bolo de Chocolate com Ninho", atualizado_em: "2026-09-23T14:38:07.261Z" }),
    ];
    expect(nomes(selecionarMaisPedidos(lista))).toEqual([
      "Bolo de Chocolate com Ninho",
      "Beijinho",
      "Cento de docinho",
      "Morango Banhado",
    ]);
  });
});

describe("Preço do card", () => {
  it("cento mostra 'R$ X o cento'", () => {
    expect(formatarPrecoVitrine({ preco: 95, tipo: "cento" })).toBe("R$ 95,00 o cento");
  });

  it("demais tipos mostram só o preço, sem unidade", () => {
    expect(formatarPrecoVitrine({ preco: 2.35, tipo: "normal" })).toBe("R$ 2,35");
    expect(formatarPrecoVitrine({ preco: 1234.5, tipo: "normal" })).toBe("R$ 1.234,50");
  });
});
