import { describe, expect, it, vi } from "vitest";

// Login e admin têm título próprio e não herdam o título público do layout
// raiz (PR fase4/seo-metadados). Nenhum dos dois tem canonical nem Open Graph.

vi.mock("@/lib/supabase/dal", () => ({ requireAuth: vi.fn(), getAuthenticatedUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("./admin/actions", () => ({ logout: vi.fn() }));
vi.mock("./login/actions", () => ({ login: vi.fn() }));

describe("títulos do login e do admin", () => {
  it("login: Entrar · Pingo de Mell", async () => {
    const { metadata } = await import("./login/page");
    expect(metadata.title).toBe("Entrar · Pingo de Mell");
    expect(metadata.alternates).toBeUndefined();
    expect(metadata.openGraph).toBeUndefined();
  });

  it("admin: Pingo de Mell · Admin", async () => {
    const { metadata } = await import("./admin/layout");
    expect(metadata.title).toBe("Pingo de Mell · Admin");
    expect(metadata.alternates).toBeUndefined();
    expect(metadata.openGraph).toBeUndefined();
  });
});
