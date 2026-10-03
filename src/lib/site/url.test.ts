import { describe, expect, it } from "vitest";
import { SITE_URL, urlDoSite } from "./url";

describe("endereço base do site (PR fase4/seo-metadados)", () => {
  it("hoje é o endereço da Netlify: no corte do DNS vira https://www.pingodemell.com.br, junto com SITE_INDEXAVEL", () => {
    // Quem mudar a constante muda este teste de propósito.
    expect(SITE_URL).toBe("https://pingodemell.netlify.app");
  });

  it("sem barra no fim, https", () => {
    expect(SITE_URL.endsWith("/")).toBe(false);
    expect(SITE_URL.startsWith("https://")).toBe(true);
  });

  it("monta o endereço absoluto de um caminho", () => {
    expect(urlDoSite("/")).toBe(`${SITE_URL}/`);
    expect(urlDoSite("/produtos?categoria=bolos")).toBe(`${SITE_URL}/produtos?categoria=bolos`);
    expect(urlDoSite("quem-somos")).toBe(`${SITE_URL}/quem-somos`);
  });
});
