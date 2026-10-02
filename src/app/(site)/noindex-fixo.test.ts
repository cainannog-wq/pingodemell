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
