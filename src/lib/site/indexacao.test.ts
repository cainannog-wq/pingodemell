import { describe, expect, it } from "vitest";
import { SITE_INDEXAVEL, cabecalhoRobots, metadataRobots } from "./indexacao";

const CONTEXTOS = ["production", "deploy-preview", "branch-deploy", undefined];

describe("trava de indexação (PR noindex-site)", () => {
  it("hoje o site está fora dos buscadores: virar para true é item do checklist do corte de DNS", () => {
    // Quem mudar a constante muda este teste de propósito.
    expect(SITE_INDEXAVEL).toBe(false);
  });

  it("travado: noindex, nofollow em qualquer contexto", () => {
    for (const contexto of CONTEXTOS) {
      expect(cabecalhoRobots(false, contexto), String(contexto)).toBe("noindex, nofollow");
    }
  });

  it("indexável: sem cabeçalho fora da homologação; a homologação continua noindex", () => {
    expect(cabecalhoRobots(true, "production")).toBeNull();
    expect(cabecalhoRobots(true, "deploy-preview")).toBeNull();
    expect(cabecalhoRobots(true, undefined)).toBeNull();
    expect(cabecalhoRobots(true, "branch-deploy")).toBe("noindex, nofollow");
  });

  it("meta robots do layout raiz", () => {
    expect(metadataRobots(false)).toEqual({ index: false, follow: false });
    expect(metadataRobots(true)).toBeUndefined();
  });
});
