// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VERSAO_POLITICA } from "@/lib/site/politica-versao";
import { somarDias } from "@/lib/tempo/brasilia";
import {
  CHAVE_CONSENTIMENTO,
  assinarConsentimento,
  escreverConsentimento,
  gravarConsentimento,
  lerConsentimento,
  lerConsentimentoDe,
  reiniciarConsentimentoParaTeste,
} from "./consentimento";

const HOJE = "2026-10-05";

describe("regra do consentimento (lerConsentimentoDe)", () => {
  const salvo = (o: Record<string, unknown>) => JSON.stringify({ versao: 1, escolha: "aceito", data: HOJE, versaoPolitica: 1, ...o });

  it("aceito de hoje: vale", () => {
    expect(lerConsentimentoDe(salvo({}), HOJE, 1)).toEqual({ versao: 1, escolha: "aceito", data: HOJE, versaoPolitica: 1 });
  });
  it("recusado de hoje: vale", () => {
    expect(lerConsentimentoDe(salvo({ escolha: "recusado" }), HOJE, 1)?.escolha).toBe("recusado");
  });
  it("180 dias: ainda vale; 181 dias: expirado (aceite e recusa)", () => {
    for (const escolha of ["aceito", "recusado"]) {
      expect(lerConsentimentoDe(salvo({ escolha, data: somarDias(HOJE, -180) }), HOJE, 1)?.escolha).toBe(escolha);
      expect(lerConsentimentoDe(salvo({ escolha, data: somarDias(HOJE, -181) }), HOJE, 1)).toBeNull();
    }
  });
  it("versão da Política diferente: pergunta de novo", () => {
    expect(lerConsentimentoDe(salvo({ versaoPolitica: 1 }), HOJE, 2)).toBeNull();
    expect(lerConsentimentoDe(salvo({ versaoPolitica: 2 }), HOJE, 1)).toBeNull();
  });
  it.each([
    ["nulo", null],
    ["vazio", ""],
    ["JSON quebrado", "{versao:1"],
    ["número", "5"],
    ["versão do formato diferente", salvo({ versao: 2 })],
    ["escolha inválida", salvo({ escolha: "talvez" })],
    ["data inválida", salvo({ data: "05/10/2026" })],
    ["data no futuro", salvo({ data: somarDias(HOJE, 1) })],
    ["sem versaoPolitica", JSON.stringify({ versao: 1, escolha: "aceito", data: HOJE })],
  ])("%s: inválido", (_, texto) => {
    expect(lerConsentimentoDe(texto, HOJE, 1)).toBeNull();
  });
  it("escreverConsentimento grava os quatro campos", () => {
    expect(JSON.parse(escreverConsentimento("recusado", HOJE, 1))).toEqual({
      versao: 1,
      escolha: "recusado",
      data: HOJE,
      versaoPolitica: 1,
    });
  });
});

describe("loja do consentimento no navegador", () => {
  beforeEach(() => {
    window.localStorage.clear();
    reiniciarConsentimentoParaTeste();
    // 05/10/2026 às 23h de Brasília (02h UTC do dia 06): o dia é o da loja.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-06T02:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("sem nada salvo: sem escolha", () => {
    expect(lerConsentimento()).toBeNull();
  });

  it("gravar aceito: salva só pdm-consentimento-v1, com o dia de Brasília, e avisa quem assina", () => {
    const aviso = vi.fn();
    const parar = assinarConsentimento(aviso);
    gravarConsentimento("aceito");
    expect(Object.keys(window.localStorage)).toEqual([CHAVE_CONSENTIMENTO]);
    expect(JSON.parse(window.localStorage.getItem(CHAVE_CONSENTIMENTO)!)).toEqual({
      versao: 1,
      escolha: "aceito",
      data: "2026-10-05",
      versaoPolitica: VERSAO_POLITICA,
    });
    expect(lerConsentimento()?.escolha).toBe("aceito");
    expect(aviso).toHaveBeenCalledTimes(1);
    parar();
  });

  it("gravar recusado depois de aceito: troca a escolha", () => {
    gravarConsentimento("aceito");
    gravarConsentimento("recusado");
    expect(lerConsentimento()?.escolha).toBe("recusado");
  });

  it("devolve o mesmo objeto enquanto nada muda (useSyncExternalStore)", () => {
    gravarConsentimento("aceito");
    expect(lerConsentimento()).toBe(lerConsentimento());
  });

  it("escolha salva que expira com o passar do tempo: volta a nulo", () => {
    gravarConsentimento("aceito");
    vi.setSystemTime(new Date("2027-04-04T15:00:00Z")); // 181 dias depois de 05/10/2026
    expect(lerConsentimento()).toBeNull();
  });

  it("localStorage lançando erro: a escolha fica só na memória e nada quebra", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    expect(lerConsentimento()).toBeNull();
    expect(() => gravarConsentimento("aceito")).not.toThrow();
    expect(lerConsentimento()?.escolha).toBe("aceito");
    // Recarregar a página (estado novo do módulo): pergunta de novo.
    reiniciarConsentimentoParaTeste();
    expect(lerConsentimento()).toBeNull();
  });
});
