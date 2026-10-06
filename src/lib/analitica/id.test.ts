// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { VERSAO_POLITICA } from "@/lib/site/politica-versao";
import { FORMATO_ID_GA4, idGa4Efetivo, lerIdGa4 } from "./id";

// ID de mentira: o ID real nunca entra no código nem nos testes.
const ID = "G-TESTE00000";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("validação do ID do GA4", () => {
  it.each([
    ["ausente", undefined],
    ["vazio", ""],
    ["só espaço", " "],
    ["G- curto", "G-ABC12"],
    ["G- longo demais", "G-ABCDEFGHIJ123"],
    ["minúscula", "g-teste00000"],
    ["minúscula no meio", "G-teste00000"],
    ["outro prefixo", "UA-1234567-1"],
    ["com espaço em volta", ` ${ID} `],
    ["número", 123],
  ])("%s: nulo", (_, bruto) => {
    expect(idGa4Efetivo(bruto, "branch-deploy", 1)).toBeNull();
  });

  it("válido fora de produção: passa", () => {
    expect(FORMATO_ID_GA4.test(ID)).toBe(true);
    expect(idGa4Efetivo(ID, "branch-deploy", 1)).toBe(ID);
    expect(idGa4Efetivo("G-ABC123", "branch-deploy", 1)).toBe("G-ABC123");
    expect(idGa4Efetivo("G-ABCDEF123456", "branch-deploy", 1)).toBe("G-ABCDEF123456");
  });
});

describe("trava de produção pela versão da Política", () => {
  it("produção com Política versão 1: nulo, mesmo com GA4_ID definida", () => {
    expect(idGa4Efetivo(ID, "production", 1)).toBeNull();
  });
  it("produção com Política versão 2: passa", () => {
    expect(idGa4Efetivo(ID, "production", 2)).toBe(ID);
  });
  it.each(["branch-deploy", "deploy-preview", "", undefined])("fora de produção (%s) com versão 1: passa", (contexto) => {
    expect(idGa4Efetivo(ID, contexto, 1)).toBe(ID);
  });
  it("a versão vigente é a 2: a trava por versão não segura mais a produção (só a ausência de GA4_ID)", () => {
    expect(VERSAO_POLITICA).toBe(2);
  });
});

describe("lerIdGa4 lê o ambiente do build", () => {
  it("branch deploy com GA4_ID: o ID", () => {
    vi.stubEnv("GA4_ID", ID);
    vi.stubEnv("CONTEXTO_NETLIFY", "branch-deploy");
    expect(lerIdGa4()).toBe(ID);
  });
  it("produção com GA4_ID e versaoPolitica 1: nulo (trava por versão)", async () => {
    vi.stubEnv("GA4_ID", ID);
    vi.stubEnv("CONTEXTO_NETLIFY", "production");
    vi.resetModules();
    vi.doMock("@/lib/site/politica-versao", () => ({ VERSAO_POLITICA: 1 }));
    try {
      const { lerIdGa4: lerComVersao1 } = await import("./id");
      expect(lerComVersao1()).toBeNull();
    } finally {
      vi.doUnmock("@/lib/site/politica-versao");
      vi.resetModules();
    }
  });
  it("produção com GA4_ID e a versão vigente (2): o ID", () => {
    vi.stubEnv("GA4_ID", ID);
    vi.stubEnv("CONTEXTO_NETLIFY", "production");
    expect(lerIdGa4()).toBe(ID);
  });
  it("produção sem GA4_ID: nulo", () => {
    vi.stubEnv("GA4_ID", "");
    vi.stubEnv("CONTEXTO_NETLIFY", "production");
    expect(lerIdGa4()).toBeNull();
  });
  it("sem GA4_ID: nulo", () => {
    vi.stubEnv("GA4_ID", "");
    vi.stubEnv("CONTEXTO_NETLIFY", "branch-deploy");
    expect(lerIdGa4()).toBeNull();
  });
});

describe("GA4_ID no bloco env do next.config.ts", () => {
  it.each([
    [undefined, ""],
    ["", ""],
    [ID, ID],
  ])("GA4_ID=%s vira %j no build", async (valor, esperado) => {
    vi.stubEnv("GA4_ID", valor);
    vi.resetModules();
    const { default: config } = await import("../../../next.config");
    expect(config.env?.GA4_ID).toBe(esperado);
  });
});
