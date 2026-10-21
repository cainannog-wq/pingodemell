import { describe, expect, it } from "vitest";
import { kitDisponivel, montarConfigKit, opcoesDeEscolha, tamanhoCompleto, tamanhosDisponiveis } from "./config";
import { progressoDaDistribuicao, validarEscolhas, type EscolhasKit } from "./escolhas";
import {
  BEIJINHO,
  BRIGADEIRO,
  CAJUZINHO,
  CHOCOLATE,
  GRUPO_DOCES,
  NINHO,
  OLHO,
  REFRI,
  SUCO,
  configDoExemplo,
  linhasDoExemplo,
} from "./fixtura";
import { NOME_OPCAO_DESCONHECIDA, linhasDaComposicao, montarRetrato, textoDaComposicao, textoKg } from "./texto";

const config = configDoExemplo();
const certo = (): EscolhasKit => ({
  bolo: [[NINHO, 1]],
  doces: [[BRIGADEIRO, 10], [BEIJINHO, 10]],
  bebida: [[SUCO, 2]],
});

describe("configuração", () => {
  it("monta tamanhos e grupos em ordem, com as opções da lista", () => {
    expect(config.tamanhos.map((t) => t.pessoas)).toEqual([10, 15, 20, 30, 40, 50]);
    expect(config.grupos.map((g) => g.chave)).toEqual(["bolo", "doces", "bebida", "descartaveis"]);
    expect(config.grupos[1].opcoes.map((o) => o.nome)).toEqual(["Brigadeiro", "Beijinho", "Cajuzinho", "Olho de sogra"]);
  });

  it("escolha única com linha por opção mostra só as opções com linha e a quantidade de cada", () => {
    const bebida = config.grupos[2];
    expect(opcoesDeEscolha(bebida, 10).map((o) => [o.opcao.nome, o.total])).toEqual([["Suco de uva", 2], ["Refrigerante", 1]]);
    expect(opcoesDeEscolha(config.grupos[0], 10).map((o) => o.total)).toEqual([1, 1]);
  });

  it("opção inativa não aparece para escolher", () => {
    const l = linhasDoExemplo();
    l.itens.find((i) => i.id === CHOCOLATE)!.ativo = false;
    const c = montarConfigKit("p", l);
    expect(opcoesDeEscolha(c.grupos[0], 10).map((o) => o.opcao.nome)).toEqual(["Ninho com morango"]);
  });

  it("tamanho sem quantidade em algum grupo não está disponível; kit sem tamanho é indisponível", () => {
    const l = linhasDoExemplo();
    l.quantidades = l.quantidades.filter((q) => !(q.pessoas === 15 && q.grupo_id === GRUPO_DOCES));
    const c = montarConfigKit("p", l);
    expect(tamanhoCompleto(c, 15)).toBe(false);
    expect(tamanhosDisponiveis(c).map((t) => t.pessoas)).toEqual([10, 20, 30, 40, 50]);
    expect(kitDisponivel(c)).toBe(true);
    expect(kitDisponivel(montarConfigKit("p", { ...l, quantidades: [] }))).toBe(false);
    expect(kitDisponivel(null)).toBe(false);
  });
});

describe("validação das escolhas", () => {
  it("composição certa passa, na tela e no servidor", () => {
    expect(validarEscolhas(config, 10, certo(), "tela")).toEqual({ ok: true, avisos: [] });
    expect(validarEscolhas(config, 10, certo(), "servidor")).toEqual({ ok: true, avisos: [] });
  });

  const problemas = (e: EscolhasKit, modo: "tela" | "servidor" = "tela", pessoas = 10) => {
    const r = validarEscolhas(config, pessoas, e, modo);
    return r.ok ? "" : r.problemas.map((p) => p.mensagem).join(" | ");
  };

  it("soma, passo e máximo de sabores", () => {
    expect(problemas({ ...certo(), doces: [[BRIGADEIRO, 10]] })).toMatch(/soma tem de ser 20/);
    expect(problemas({ ...certo(), doces: [[BRIGADEIRO, 15], [BEIJINHO, 5]] })).toMatch(/de 10 em 10/);
    expect(problemas({ ...certo(), doces: [[BRIGADEIRO, 10], [BEIJINHO, 10], [CAJUZINHO, 10], [OLHO, 10]] })).toMatch(/soma/);
    const c30 = { ...certo(), doces: [[BRIGADEIRO, 10], [BEIJINHO, 20], [CAJUZINHO, 10], [OLHO, 20]] as [string, number][] };
    expect(problemas(c30, "tela", 30)).toMatch(/no máximo 3 sabores/);
  });

  it("escolha única: uma opção, quantidade da opção", () => {
    expect(problemas({ ...certo(), bolo: [] })).toMatch(/escolha uma opção/);
    expect(problemas({ ...certo(), bolo: [[NINHO, 1], [CHOCOLATE, 1]] })).toMatch(/escolha uma opção/);
    expect(problemas({ ...certo(), bebida: [[SUCO, 3]] })).toMatch(/quantidade diferente/);
    expect(problemas({ ...certo(), bebida: [[REFRI, 1]] })).toBe("");
  });

  it("repetição, quantidade inválida, grupo fixo com escolha e grupo desconhecido", () => {
    expect(problemas({ ...certo(), doces: [[BRIGADEIRO, 10], [BRIGADEIRO, 10]] })).toMatch(/repetida/);
    expect(problemas({ ...certo(), doces: [[BRIGADEIRO, 0], [BEIJINHO, 20]] })).toMatch(/inválida/);
    expect(problemas({ ...certo(), descartaveis: [[NINHO, 1]] })).toMatch(/não tem escolha/);
    expect(problemas({ ...certo(), extra: [] })).toMatch(/não existe neste kit/);
    expect(validarEscolhas(config, 99, certo(), "tela").ok).toBe(false);
  });

  it("id desconhecido: recusado na tela, aceito com aviso no servidor (se a quantidade conferir)", () => {
    const estranho = "ffffffff-0000-4000-8000-000000000009";
    const e = { ...certo(), doces: [[estranho, 10], [BEIJINHO, 10]] as [string, number][] };
    expect(problemas(e, "tela")).toMatch(/opção inválida/);
    const r = validarEscolhas(config, 10, e, "servidor");
    expect(r.ok).toBe(true);
    expect(r.ok && r.avisos[0]).toContain(estranho);
    expect(problemas({ ...e, doces: [[estranho, 10]] }, "servidor")).toMatch(/soma/);
  });

  it("progresso da distribuição: falta e sobra", () => {
    const g = config.grupos[1];
    expect(progressoDaDistribuicao(g, 10, [[BRIGADEIRO, 10]])).toEqual({ total: 20, feitos: 10, falta: 10, sobra: 0 });
    expect(progressoDaDistribuicao(g, 10, [[BRIGADEIRO, 30]])).toEqual({ total: 20, feitos: 30, falta: 0, sobra: 10 });
  });
});

describe("texto da composição", () => {
  it("monta as linhas, com o rótulo por opção da bebida e os descartáveis", () => {
    const r = montarRetrato(config, 20, {
      bolo: [[CHOCOLATE, 1]],
      doces: [[BRIGADEIRO, 20], [BEIJINHO, 20]],
      bebida: [[SUCO, 4]],
    });
    expect(linhasDaComposicao(r)).toEqual([
      "Bolo: 1,5 kg",
      "Recheio do bolo: Chocolate",
      "Doces: Brigadeiro 20, Beijinho 20",
      "Bebida: 4 Suco de uva 1L",
      "Descartáveis: 20 pratos e copos",
      "Descartáveis incluídos",
    ]);
    expect(textoDaComposicao(r).split("\n")).toHaveLength(6);
  });

  it("sem descartáveis quando o tamanho não os inclui; opção desconhecida ganha o texto fixo", () => {
    const r = montarRetrato(config, 10, { bolo: [["ffffffff-0000-4000-8000-000000000001", 1]], doces: [], bebida: [] });
    expect(linhasDaComposicao(r)).not.toContain("Descartáveis incluídos");
    expect(linhasDaComposicao(r)[1]).toBe(`Recheio do bolo: ${NOME_OPCAO_DESCONHECIDA}`);
  });

  it("nada de emoji nem hífen no texto que a cliente lê", () => {
    const r = montarRetrato(config, 30, certo());
    expect(textoDaComposicao(r)).not.toMatch(/[-‐-―\u{1F300}-\u{1FAFF}]/u);
    expect(textoKg(2)).toBe("2 kg");
    expect(textoKg(0.5)).toBe("0,5 kg");
  });
});
