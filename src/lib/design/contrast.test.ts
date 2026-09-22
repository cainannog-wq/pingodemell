import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast";

const WHITE = "#ffffff";

// Valores medidos na auditoria de acessibilidade de 22/09/2026 e
// corrigidos nesta rodada (docs/status-pingo-de-mell.md). Os hex abaixo
// espelham os tokens em src/styles/ds/tokens/colors.css — se um token
// mudar de valor lá, este teste precisa acompanhar.
describe("contrastRatio — sanity check contra a fórmula do WCAG", () => {
  it("preto sobre branco é 21:1 (caso de referência)", () => {
    expect(contrastRatio("#000000", WHITE)).toBeCloseTo(21, 0);
  });

  it("branco sobre branco é 1:1 (caso de referência)", () => {
    expect(contrastRatio(WHITE, WHITE)).toBeCloseTo(1, 5);
  });
});

describe("Auditoria de acessibilidade 22/09/2026 — contraste corrigido", () => {
  it("trilho do toggle ligado (--pdm-brown) atinge 3:1 contra branco", () => {
    const ratio = contrastRatio("#8b592a", WHITE);
    expect(ratio).toBeGreaterThanOrEqual(3);
    expect(ratio).toBeCloseTo(5.9, 1);
  });

  it("trilho do toggle desligado (--pdm-muted) atinge 3:1 contra branco", () => {
    const ratio = contrastRatio("#7a6f5c", WHITE);
    expect(ratio).toBeGreaterThanOrEqual(3);
    expect(ratio).toBeCloseTo(4.93, 1);
  });

  it("ícone de destaque (--pdm-brown, tone=default) atinge 3:1 contra branco", () => {
    const ratio = contrastRatio("#8b592a", WHITE);
    expect(ratio).toBeGreaterThanOrEqual(3);
  });

  it("texto 'Ativo'/'Salvo' (--pdm-success-text) atinge 4,5:1 contra branco", () => {
    const ratio = contrastRatio("#52703a", WHITE);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(ratio).toBeCloseTo(5.62, 1);
  });

  it("regressão: as cores antigas de fato falhavam (documenta o antes/depois)", () => {
    expect(contrastRatio("#fed627", WHITE)).toBeLessThan(3); // --pdm-gold, trilho ligado antigo
    expect(contrastRatio("#e6e2d7", WHITE)).toBeLessThan(3); // --pdm-disabled-bg, trilho desligado antigo
    expect(contrastRatio("#c89552", WHITE)).toBeLessThan(3); // --pdm-gold-soft, ícone de destaque antigo
    expect(contrastRatio("#6b8e4e", WHITE)).toBeLessThan(4.5); // --pdm-success, texto antigo
  });
});
