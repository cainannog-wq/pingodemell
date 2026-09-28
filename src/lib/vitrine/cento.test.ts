import { describe, expect, it } from "vitest";
import {
  alterarSabor,
  centosComSabor,
  centosValidos,
  composicaoValida,
  distribuicaoInicial,
  MAX_CENTOS,
  passoCentos,
  podeAumentar,
  saboresAtivos,
  semCentoIndisponivel,
  situacaoDistribuicao,
  totalDoCento,
  type Distribuicao,
  type LinhaSabor,
} from "./cento";

// Dado simulado: nenhum produto real é desativado para provar estes casos.
function linha(cento_nome: string, subitem_nome: string, ordem: number, ativo: boolean | null): LinhaSabor {
  return { cento_nome, subitem_nome, ordem, sabor: ativo === null ? null : { nome: subitem_nome, ativo } };
}

describe("sabores ativos do Cento", () => {
  it("só os ativos, na ordem do cadastro; inativo (admin logado) e escondido pela RLS (anônimo) não contam", () => {
    const linhas = [
      linha("Cento", "Empada", 2, true),
      linha("Cento", "Coxinha", 0, true),
      linha("Cento", "Torta", 1, false),
      linha("Cento", "Kibe", 3, null),
    ];
    expect(saboresAtivos(linhas, "Cento")).toEqual(["Coxinha", "Empada"]);
  });

  it("caso 1 sabor ativo (simulado): a lista tem só ele", () => {
    expect(saboresAtivos([linha("C", "Coxinha", 0, true), linha("C", "Torta", 1, false)], "C")).toEqual(["Coxinha"]);
  });

  it("caso 0 sabor ativo (simulado): lista vazia, Cento indisponível na vitrine", () => {
    const linhas = [linha("Sem", "Torta", 0, false), linha("Sem", "Kibe", 1, null), linha("Com", "Coxinha", 0, true)];
    expect(saboresAtivos(linhas, "Sem")).toEqual([]);
    const comSabor = centosComSabor(linhas);
    const vitrine = [
      { nome: "Sem", tipo: "cento" as const },
      { nome: "Com", tipo: "cento" as const },
      { nome: "Bolo", tipo: "normal" as const },
    ];
    expect(semCentoIndisponivel(vitrine, comSabor).map((p) => p.nome)).toEqual(["Com", "Bolo"]);
  });
});

describe("distribuição: soma exata de 100 × centos, em passos de 5", () => {
  const SABORES = ["Coxinha", "Kibe", "Risole"];

  it("total = 100 × centos", () => {
    expect(totalDoCento(1)).toBe(100);
    expect(totalDoCento(3)).toBe(300);
  });

  it("com 2 ou mais sabores começa zerado; com 1 sabor o total inteiro vai nele", () => {
    expect(distribuicaoInicial(SABORES, 1)).toEqual({ Coxinha: 0, Kibe: 0, Risole: 0 });
    expect(distribuicaoInicial(["Coxinha"], 1)).toEqual({ Coxinha: 100 });
    expect(distribuicaoInicial(["Coxinha"], 3)).toEqual({ Coxinha: 300 });
    expect(composicaoValida({ Coxinha: 300 }, ["Coxinha"], 3)).toBe(true);
  });

  it("+ e − de 5 em 5, nunca abaixo de 0, e o + trava quando a soma chega ao total", () => {
    let d: Distribuicao = distribuicaoInicial(SABORES, 1);
    d = alterarSabor(d, "Coxinha", 1, 1);
    expect(d.Coxinha).toBe(5);
    d = alterarSabor(d, "Coxinha", -1, 1);
    d = alterarSabor(d, "Coxinha", -1, 1);
    expect(d.Coxinha).toBe(0);
    for (let i = 0; i < 10; i++) d = alterarSabor(d, "Coxinha", 1, 1);
    for (let i = 0; i < 4; i++) d = alterarSabor(d, "Kibe", 1, 1);
    for (let i = 0; i < 6; i++) d = alterarSabor(d, "Risole", 1, 1);
    expect(d).toEqual({ Coxinha: 50, Kibe: 20, Risole: 30 });
    expect(podeAumentar(d, "Kibe", 1)).toBe(false);
    expect(alterarSabor(d, "Kibe", 1, 1)).toBe(d);
    expect(composicaoValida(d, SABORES, 1)).toBe(true);
  });

  it("2 centos: 200 numa combinação só", () => {
    let d: Distribuicao = distribuicaoInicial(SABORES, 2);
    for (let i = 0; i < 24; i++) d = alterarSabor(d, "Coxinha", 1, 2);
    for (let i = 0; i < 16; i++) d = alterarSabor(d, "Kibe", 1, 2);
    expect(situacaoDistribuicao(d, 2)).toMatchObject({ soma: 200, total: 200, falta: 0, completa: true });
    expect(composicaoValida(d, SABORES, 2)).toBe(true);
    expect(composicaoValida(d, SABORES, 1)).toBe(false);
  });

  it("incompleta: mostra quanto falta e não vale", () => {
    const d = { Coxinha: 40, Kibe: 30, Risole: 0 };
    expect(situacaoDistribuicao(d, 1)).toMatchObject({ soma: 70, falta: 30, sobra: 0, completa: false });
    expect(composicaoValida(d, SABORES, 1)).toBe(false);
  });

  it("diminuir os centos depois de distribuir: mostra quanto passou e não vale", () => {
    const d = { Coxinha: 120, Kibe: 80, Risole: 0 };
    expect(situacaoDistribuicao(d, 1)).toMatchObject({ soma: 200, falta: 0, sobra: 100, completa: false });
    expect(composicaoValida(d, SABORES, 1)).toBe(false);
  });

  it("recusa quantidade fora do passo de 5, negativa, sabor de fora ou sabor faltando", () => {
    expect(composicaoValida({ Coxinha: 52, Kibe: 48, Risole: 0 }, SABORES, 1)).toBe(false);
    expect(composicaoValida({ Coxinha: 105, Kibe: -5, Risole: 0 }, SABORES, 1)).toBe(false);
    expect(composicaoValida({ Coxinha: 50, Kibe: 50, Pizza: 0 }, SABORES, 1)).toBe(false);
    expect(composicaoValida({ Coxinha: 50, Kibe: 50 }, SABORES, 1)).toBe(false);
    expect(composicaoValida({}, [], 1)).toBe(false);
    expect(alterarSabor({ Coxinha: 0 }, "Pizza", 1, 1)).toEqual({ Coxinha: 0 });
  });

  it("centos: 1 a MAX_CENTOS, inteiro, de 1 em 1 (sem pedido_minimo nem step)", () => {
    expect(centosValidos(1)).toBe(true);
    expect(centosValidos(0)).toBe(false);
    expect(centosValidos(1.5)).toBe(false);
    expect(centosValidos(MAX_CENTOS + 1)).toBe(false);
    expect(passoCentos(1, -1)).toBe(1);
    expect(passoCentos(1, 1)).toBe(2);
    expect(passoCentos(MAX_CENTOS, 1)).toBe(MAX_CENTOS);
  });
});
