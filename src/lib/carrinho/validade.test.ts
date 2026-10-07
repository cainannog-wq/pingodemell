// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHAVE_CARRINHO, gravar, lerNoNavegador, reiniciarParaTeste } from "./armazenamento";
import { VALIDADE_CARRINHO_HORAS, escreverCarrinho, lerCarrinho, lerCarrinhoGuardado, type LinhaCarrinho } from "./regras";

// Validade do carrinho no navegador (PR perf/vitrine-consultas-cache): 48
// horas depois da última alteração, de forma deslizante. Relógio fixo (não
// depende do relógio real nem do fuso da máquina).

const HORA = 60 * 60 * 1000;
const AGORA = Date.parse("2026-10-06T23:30:00Z"); // 20h30 de Brasília

const LINHA: LinhaCarrinho = {
  id: "l-1",
  tipo: "normal",
  produtoId: "3f1c9a52-0000-4000-8000-000000000001",
  slug: "brigadeiro-gourmet",
  nome: "Brigadeiro Gourmet",
  preco: 2.35,
  unidade_venda: "unidade",
  quantidade: 30,
  observacao: null,
};

const guardadoComData = (horasAtras: number) =>
  JSON.stringify({ versao: 1, alteradoEm: new Date(AGORA - horasAtras * HORA).toISOString(), linhas: [LINHA] });
const guardadoSemData = () => JSON.stringify({ versao: 1, linhas: [LINHA] });
const noArmazenamento = () => JSON.parse(window.localStorage.getItem(CHAVE_CARRINHO) ?? "null");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AGORA);
  window.localStorage.clear();
  reiniciarParaTeste();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("regra (regras.ts)", () => {
  it("o prazo é uma constante única: 48 horas", () => {
    expect(VALIDADE_CARRINHO_HORAS).toBe(48);
  });

  it("dentro do prazo é mantido (47 h e 48 h exatas); fora do prazo é descartado (48 h e 1 min, 49 h)", () => {
    expect(lerCarrinho(guardadoComData(47), AGORA)).toEqual([LINHA]);
    expect(lerCarrinho(guardadoComData(48), AGORA)).toEqual([LINHA]);
    expect(lerCarrinhoGuardado(guardadoComData(48 + 1 / 60), AGORA)).toEqual({ linhas: [], vencido: true, semData: false });
    expect(lerCarrinho(guardadoComData(49), AGORA)).toEqual([]);
  });

  it("sem data (gravado antes deste campo) ou com data ilegível: mantido e marcado para receber data", () => {
    expect(lerCarrinhoGuardado(guardadoSemData(), AGORA)).toEqual({ linhas: [LINHA], vencido: false, semData: true });
    const ilegivel = JSON.stringify({ versao: 1, alteradoEm: "ontem", linhas: [LINHA] });
    expect(lerCarrinhoGuardado(ilegivel, AGORA)).toEqual({ linhas: [LINHA], vencido: false, semData: true });
  });

  it("gravar põe a data da alteração, na mesma chave e versão", () => {
    expect(JSON.parse(escreverCarrinho([LINHA], AGORA))).toEqual({ versao: 1, alteradoEm: new Date(AGORA).toISOString(), linhas: [LINHA] });
  });
});

describe("no navegador (armazenamento.ts)", () => {
  it("carrinho dentro do prazo continua", () => {
    window.localStorage.setItem(CHAVE_CARRINHO, guardadoComData(47));
    expect(lerNoNavegador()).toEqual([LINHA]);
    expect(noArmazenamento().linhas).toEqual([LINHA]);
  });

  it("carrinho fora do prazo é descartado em silêncio: a tela vê vazio e o guardado sai do navegador", () => {
    window.localStorage.setItem(CHAVE_CARRINHO, guardadoComData(49));
    const erro = vi.spyOn(console, "error");
    const aviso = vi.spyOn(console, "warn");
    expect(lerNoNavegador()).toEqual([]);
    expect(window.localStorage.getItem(CHAVE_CARRINHO)).toBeNull();
    expect(erro).not.toHaveBeenCalled();
    expect(aviso).not.toHaveBeenCalled();
  });

  it("carrinho sem data é mantido e recebe a data da primeira leitura, com as linhas como estavam", () => {
    window.localStorage.setItem(CHAVE_CARRINHO, guardadoSemData());
    const primeira = lerNoNavegador();
    expect(primeira).toEqual([LINHA]);
    expect(noArmazenamento()).toEqual({ versao: 1, linhas: [LINHA], alteradoEm: new Date(AGORA).toISOString() });
    // Mesmo array na leitura seguinte (o React exige snapshot estável).
    expect(lerNoNavegador()).toBe(primeira);
    // E o prazo passa a contar dessa leitura.
    vi.setSystemTime(AGORA + 49 * HORA);
    reiniciarParaTeste();
    expect(lerNoNavegador()).toEqual([]);
  });

  it("cada alteração renova a data (prazo deslizante)", () => {
    gravar([LINHA]);
    expect(noArmazenamento().alteradoEm).toBe(new Date(AGORA).toISOString());
    vi.setSystemTime(AGORA + 47 * HORA);
    gravar([{ ...LINHA, quantidade: 35 }]);
    expect(noArmazenamento().alteradoEm).toBe(new Date(AGORA + 47 * HORA).toISOString());
    // 94 h depois da primeira gravação, mas só 47 h depois da última: vale.
    vi.setSystemTime(AGORA + 94 * HORA);
    reiniciarParaTeste();
    expect(lerNoNavegador()).toEqual([{ ...LINHA, quantidade: 35 }]);
  });

  it("falha do armazenamento continua caindo na memória da aba (e a validade vale lá também)", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    expect(lerNoNavegador()).toEqual([]);
    gravar([LINHA]);
    expect(lerNoNavegador()).toEqual([LINHA]);
    vi.setSystemTime(AGORA + 47 * HORA);
    gravar([LINHA, { ...LINHA, id: "l-2" }]);
    expect(lerNoNavegador()).toHaveLength(2);
  });
});
