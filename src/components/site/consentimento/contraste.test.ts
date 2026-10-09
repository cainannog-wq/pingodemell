import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/lib/design/contrast";

// Contraste do banner de consentimento e do botão da Política, calculado dos
// tokens de src/styles/ds/tokens/colors.css (resolvendo var(--x)), com as
// cores que o código usa (site.css "Banner de consentimento", Button
// secondary e TextLink).

const css = readFileSync(join(process.cwd(), "src/styles/ds/tokens/colors.css"), "utf8");
function token(nome: string): string {
  const achado = css.match(new RegExp(`--${nome}:\\s*([^;]+);`));
  if (!achado) throw new Error(`token --${nome} não encontrado`);
  const valor = achado[1].trim();
  const ref = valor.match(/^var\(--([a-z0-9-]+)\)$/);
  if (ref) return token(ref[1]);
  if (!/^#[0-9a-fA-F]{6}$/.test(valor)) throw new Error(`token --${nome} não é cor hex: ${valor}`);
  return valor;
}

describe("contraste do banner de consentimento", () => {
  const fundo = token("surface-raised");

  it("texto (--text-body) sobre o fundo do banner (--surface-raised): pelo menos 4,5:1", () => {
    expect(contrastRatio(token("text-body"), fundo)).toBeGreaterThanOrEqual(4.5);
  });
  it("link da Política (--text-link) sobre o fundo do banner: pelo menos 4,5:1", () => {
    expect(contrastRatio(token("text-link"), fundo)).toBeGreaterThanOrEqual(4.5);
  });
  it("botões Aceitar e Recusar (secondary: --pdm-brown sobre o fundo; hover: branco sobre --pdm-brown): pelo menos 4,5:1", () => {
    expect(contrastRatio(token("pdm-brown"), fundo)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(token("pdm-white"), token("pdm-brown"))).toBeGreaterThanOrEqual(4.5);
    const botao = readFileSync(join(process.cwd(), "src/components/ds/Button.tsx"), "utf8");
    expect(botao).toMatch(/secondary: \{ background: "transparent", color: "var\(--pdm-brown\)", borderColor: "var\(--pdm-brown\)" \}/);
    expect(botao).toMatch(/secondaryHover: \{ background: "var\(--pdm-brown\)", color: "var\(--pdm-white\)" \}/);
  });
  it("contorno de foco (--focus-ring) sobre o fundo: pelo menos 3:1", () => {
    expect(contrastRatio(token("focus-ring"), fundo)).toBeGreaterThanOrEqual(3);
  });
  it("Preferências de privacidade na Política (secondary: --pdm-brown sobre --surface-page; hover: branco sobre --pdm-brown): pelo menos 4,5:1", () => {
    expect(contrastRatio(token("pdm-brown"), token("surface-page"))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(token("pdm-white"), token("pdm-brown"))).toBeGreaterThanOrEqual(4.5);
  });
  it("alvo de toque: --tap-min é 44px (altura mínima do Button md: Aceitar, Recusar e Preferências de privacidade)", () => {
    const espacos = readFileSync(join(process.cwd(), "src/styles/ds/tokens/spacing.css"), "utf8");
    expect(espacos).toMatch(/--tap-min:\s*44px;/);
  });
});
