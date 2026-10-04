import { readFileSync } from "node:fs";
import { join } from "node:path";
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

// Botão do WhatsApp (variante "whatsapp" do Button, PR
// fase4/primeira-tela-e-contraste): o Lighthouse acusou 1,98:1 no carrinho
// vazio (branco sobre o verde). Os valores saem do próprio colors.css, para o
// teste acompanhar uma mudança de token.
describe("Botão do WhatsApp — texto sobre o verde", () => {
  const css = readFileSync(join(process.cwd(), "src/styles/ds/tokens/colors.css"), "utf8");
  const token = (nome: string) => {
    const achado = css.match(new RegExp(`--${nome}:\s*(#[0-9a-fA-F]{6})`));
    if (!achado) throw new Error(`token --${nome} não encontrado`);
    return achado[1];
  };

  it("texto --ink-900 atinge 4,5:1 sobre --pdm-whatsapp e sobre o hover (#1da851)", () => {
    expect(contrastRatio(token("ink-900"), token("pdm-whatsapp"))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(token("ink-900"), token("pdm-whatsapp"))).toBeCloseTo(10.59, 1);
    expect(contrastRatio(token("ink-900"), token("whatsapp-600"))).toBeGreaterThanOrEqual(4.5);
  });

  it("regressão: o branco antigo falhava (1,98:1)", () => {
    expect(contrastRatio(token("pdm-white"), token("pdm-whatsapp"))).toBeCloseTo(1.98, 1);
  });

  it("a variante usa --ink-900 como cor do texto", () => {
    const botao = readFileSync(join(process.cwd(), "src/components/ds/Button.tsx"), "utf8");
    expect(botao).toMatch(/whatsapp: \{ background: "var\(--pdm-whatsapp\)", color: "var\(--ink-900\)"/);
    expect(botao).toMatch(/whatsappHover: \{ background: "#1da851" \}/);
  });
});
