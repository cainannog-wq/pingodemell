import { beforeEach, describe, expect, it, vi } from "vitest";

// Depois do login, e com sessão já aberta, a primeira tela é /admin (o
// relatório de visitas), não mais /admin/produtos.

const redirect = vi.fn((destino: string) => {
  throw new Error(`REDIRECT:${destino}`);
});
vi.mock("next/navigation", () => ({ redirect: (d: string) => redirect(d) }));
const signIn = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signInWithPassword: (...a: unknown[]) => signIn(...a) } }),
}));
const getAuthenticatedUser = vi.fn();
vi.mock("@/lib/supabase/dal", () => ({ getAuthenticatedUser: () => getAuthenticatedUser(), requireAuth: vi.fn() }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("./login-form", () => ({ LoginForm: () => null }));
vi.mock("@/components/ds", () => ({ Card: () => null }));

beforeEach(() => {
  redirect.mockClear();
  signIn.mockReset();
  getAuthenticatedUser.mockReset();
});

function formulario() {
  const f = new FormData();
  f.set("email", "equipe@exemplo.com");
  f.set("password", "senha-de-teste");
  f.set("turnstileToken", "token");
  return f;
}

describe("destino do login", () => {
  it("login bem-sucedido vai para /admin", async () => {
    signIn.mockResolvedValue({ error: null });
    const { login } = await import("./actions");
    await expect(login({}, formulario())).rejects.toThrow("REDIRECT:/admin");
    expect(redirect).toHaveBeenCalledWith("/admin");
  });

  it("login recusado não redireciona", async () => {
    signIn.mockResolvedValue({ error: { message: "Invalid login credentials" } });
    const { login } = await import("./actions");
    await expect(login({}, formulario())).resolves.toEqual({ error: "E-mail ou senha inválidos." });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("/login com sessão já aberta vai para /admin", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "u" });
    const { default: Pagina } = await import("./page");
    await expect(Pagina()).rejects.toThrow("REDIRECT:/admin");
  });
});
