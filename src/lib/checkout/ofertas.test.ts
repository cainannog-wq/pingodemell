import { describe, expect, it } from "vitest";
import { acaoDaOferta, LIMITE_OFERTAS, quantidadeDaOferta, selecionarOfertas, type Oferta } from "./ofertas";

let seq = 0;
function oferta(parcial: Partial<Oferta>): Oferta {
  seq += 1;
  return {
    id: `p-${seq}`,
    slug: `produto-${seq}`,
    nome: `Produto ${seq}`,
    descricao: null,
    preco: 10,
    image_url: null,
    Categoria: "Doces",
    tipo: "normal",
    unidade_venda: null,
    pedido_minimo: 1,
    step_quantidade: "livre",
    ativo: true,
    destaque: true,
    atualizado_em: `2026-09-${String(10 + seq).padStart(2, "0")}T12:00:00Z`,
    prazo_producao_dias: 1,
    ...parcial,
  };
}

const HOJE = "2026-09-29";

describe("ofertas do rodapé do checkout", () => {
  it("só ativo e em destaque, de qualquer categoria (bebida e Cento entram)", () => {
    const coca = oferta({ nome: "Coca-cola 2L", Categoria: "Bebidas" });
    const cento = oferta({ nome: "Cento de docinho", tipo: "cento" });
    const inativo = oferta({ nome: "Inativo", ativo: false });
    const semDestaque = oferta({ nome: "Sem destaque", destaque: false });
    const nomes = selecionarOfertas([coca, cento, inativo, semDestaque], [], null, HOJE).map((o) => o.nome);
    expect(nomes).toEqual(expect.arrayContaining(["Coca-cola 2L", "Cento de docinho"]));
    expect(nomes).not.toContain("Inativo");
    expect(nomes).not.toContain("Sem destaque");
  });

  it("some o produto que já está no carrinho", () => {
    const a = oferta({ nome: "A" });
    const b = oferta({ nome: "B" });
    expect(selecionarOfertas([a, b], [{ produtoId: a.id }], null, HOJE).map((o) => o.nome)).toEqual(["B"]);
  });

  it("com data escolhida, some o que não fica pronto a tempo; sem data, aparece tudo", () => {
    const rapido = oferta({ nome: "Rápido", prazo_producao_dias: 1 });
    const demorado = oferta({ nome: "Demorado", prazo_producao_dias: 3 });
    const semPrazo = oferta({ nome: "Pronta entrega", prazo_producao_dias: 0 });
    const todos = [rapido, demorado, semPrazo];
    expect(selecionarOfertas(todos, [], null, HOJE)).toHaveLength(3);
    // Quarta 30/09: só o que fica pronto em até 1 dia.
    expect(selecionarOfertas(todos, [], "2026-09-30", HOJE).map((o) => o.nome).sort()).toEqual(["Pronta entrega", "Rápido"]);
    // Sexta 02/10: 3 dias, cabe tudo.
    expect(selecionarOfertas(todos, [], "2026-10-02", HOJE)).toHaveLength(3);
  });

  it(`no máximo ${LIMITE_OFERTAS}, do editado mais recentemente para o mais antigo`, () => {
    const lista = Array.from({ length: 8 }, (_, i) => oferta({ nome: `O${i}`, atualizado_em: `2026-09-0${i + 1}T00:00:00Z` }));
    const escolhidas = selecionarOfertas(lista, [], null, HOJE);
    expect(escolhidas).toHaveLength(LIMITE_OFERTAS);
    expect(escolhidas.map((o) => o.nome)).toEqual(["O7", "O6", "O5", "O4", "O3"]);
  });

  it("avulso entra direto; Cento, Bolo e Bento Cake levam para a interna", () => {
    expect(acaoDaOferta({ tipo: "normal" })).toBe("adicionar");
    expect(acaoDaOferta({ tipo: "cento" })).toBe("interna");
    expect(acaoDaOferta({ tipo: "bolo" })).toBe("interna");
    expect(acaoDaOferta({ tipo: "bento_cake" })).toBe("interna");
  });

  it("o avulso entra com o pedido mínimo, subindo até o múltiplo do step", () => {
    expect(quantidadeDaOferta({ pedido_minimo: 30, step_quantidade: "livre" })).toBe(30);
    expect(quantidadeDaOferta({ pedido_minimo: 12, step_quantidade: "multiplos_5" })).toBe(15);
    expect(quantidadeDaOferta({ pedido_minimo: 1, step_quantidade: "livre" })).toBe(1);
  });
});
