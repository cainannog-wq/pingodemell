import { describe, expect, it } from "vitest";
import { MAX_BUSCA, lerBusca, nomeCasaComBusca, normalizarParaBusca, palavrasDaBusca } from "./busca";

const casa = (nome: string, busca: string) => nomeCasaComBusca(nome, palavrasDaBusca(busca));

describe("Busca da Lista — normalização", () => {
  it("tira acento, cedilha e til, e deixa tudo minúsculo", () => {
    expect(normalizarParaBusca("Pão de Mel")).toBe("pao de mel");
    expect(normalizarParaBusca("AÇAÍ")).toBe("acai");
    expect(normalizarParaBusca("Éclair Côco Maçã Ñ Ü")).toBe("eclair coco maca n u");
  });

  it("sinais viram espaço e espaços repetidos somem", () => {
    expect(normalizarParaBusca("Coca-cola  2L")).toBe("coca cola 2l");
    expect(normalizarParaBusca("Beijinho (8g)")).toBe("beijinho 8g");
    expect(normalizarParaBusca("  --  ")).toBe("");
  });
});

describe("Busca da Lista — o nome casa com a busca", () => {
  it("'pao de mel' encontra 'Pão de Mel', sem diferenciar acento nem maiúscula", () => {
    for (const busca of ["pao de mel", "PÃO DE MEL", "Pão De Mel", "pão de mel", "PAO DE MEL"]) {
      expect(casa("Pão de Mel", busca), busca).toBe(true);
    }
  });

  it("o acento no texto buscado também não importa ('maçã' acha 'Maca do amor' e 'maca' acha 'Maçã do amor')", () => {
    expect(casa("Maca do amor", "maçã")).toBe(true);
    expect(casa("Maçã do amor", "maca")).toBe(true);
  });

  it("cada palavra em qualquer ordem e em qualquer parte do nome", () => {
    expect(casa("Pão de Mel", "mel pao")).toBe(true);
    expect(casa("Bolo de cenoura com chocolate", "choco bolo")).toBe(true);
    expect(casa("Brigadeiro gourmet", "gadeiro")).toBe(true);
  });

  it("todas as palavras precisam estar no nome", () => {
    expect(casa("Pão de Mel", "pao de queijo")).toBe(false);
    expect(casa("Coxinha", "coxinha frango")).toBe(false);
  });

  it("hífen e parênteses não atrapalham", () => {
    expect(casa("Coca-cola 2L", "coca cola")).toBe(true);
    expect(casa("Coca cola 2L", "coca-cola")).toBe(true);
    expect(casa("Beijinho (8g)", "8g")).toBe(true);
  });

  it("busca sem palavra (vazia, só espaços, só sinais) não filtra nada", () => {
    for (const busca of ["", "   ", "--", "!!!"]) expect(casa("Qualquer coisa", busca), busca).toBe(true);
  });
});

describe("Busca da Lista — leitura do ?busca=", () => {
  it("só espaços, vazia ou ausente vale como sem busca", () => {
    for (const valor of ["", "   ", "\t \n", undefined]) expect(lerBusca(valor)).toBe("");
  });

  it("tira espaço das pontas e junta espaços repetidos, mantendo o que a cliente escreveu", () => {
    expect(lerBusca("  Pão   de  Mel ")).toBe("Pão de Mel");
  });

  it("parâmetro repetido usa o primeiro valor", () => {
    expect(lerBusca(["bolo", "doce"])).toBe("bolo");
    expect(lerBusca([])).toBe("");
  });

  it(`corta em ${MAX_BUSCA} caracteres`, () => {
    expect(lerBusca("a".repeat(500))).toHaveLength(MAX_BUSCA);
  });
});
