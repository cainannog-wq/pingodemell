import { describe, expect, it, vi } from "vitest";

// Checkout, Política de Privacidade e confirmação ficam fora dos buscadores
// com a trava de indexação em qualquer valor (src/lib/site/indexacao.ts): o
// robots da página substitui o do layout raiz por inteiro. Se alguém apagar o
// robots de uma delas, este teste quebra, inclusive depois do corte de DNS.

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

describe("páginas que ficam noindex sempre", () => {
  it("checkout: noindex", async () => {
    const { metadata } = await import("./checkout/page");
    expect(metadata.robots).toMatchObject({ index: false });
  });

  it("Política de Privacidade: noindex", async () => {
    const { metadata } = await import("./politica-de-privacidade/page");
    expect(metadata.robots).toMatchObject({ index: false });
  });

  it("confirmação: noindex, nofollow", async () => {
    const { metadata } = await import("./confirmacao/page");
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});

// Páginas noindex não recebem canonical nem Open Graph (PR
// fase4/seo-metadados). O carrinho é noindex pela trava do layout raiz.
describe("páginas noindex sem canonical nem Open Graph", () => {
  it.each([
    ["carrinho", () => import("./carrinho/page")],
    ["checkout", () => import("./checkout/page")],
    ["confirmação", () => import("./confirmacao/page")],
    ["Política de Privacidade", () => import("./politica-de-privacidade/page")],
  ] as const)("%s", async (_nome, carregar) => {
    const { metadata } = await carregar();
    expect(metadata.alternates).toBeUndefined();
    expect(metadata.openGraph).toBeUndefined();
  });
});
