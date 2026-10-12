// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireAuth = vi.fn();
const connection = vi.fn(async () => {});
vi.mock("@/lib/supabase/dal", () => ({ requireAuth: (...a: unknown[]) => requireAuth(...a), getAuthenticatedUser: vi.fn() }));
vi.mock("next/server", () => ({ connection: () => connection() }));

const URL_FALSA = "https://datastudio.google.com/embed/reporting/00000000-0000-0000-0000-000000000000/page/abc";

beforeEach(() => {
  requireAuth.mockReset();
  connection.mockClear();
  requireAuth.mockResolvedValue({ email: "equipe@exemplo.com" });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function renderizar() {
  const { default: Pagina } = await import("./page");
  return render(await Pagina());
}

describe("/admin: relatório de visitas", () => {
  it("sem sessão: o redirecionamento acontece antes e a variável nem é lida", async () => {
    vi.stubEnv("LOOKER_REPORT_URL", URL_FALSA);
    requireAuth.mockRejectedValue(new Error("NEXT_REDIRECT"));
    const lida = vi.fn();
    const original = process.env;
    process.env = new Proxy(original, {
      get(alvo, chave) {
        if (chave === "LOOKER_REPORT_URL") lida();
        return alvo[chave as string];
      },
    });
    try {
      await expect(renderizar()).rejects.toThrow("NEXT_REDIRECT");
    } finally {
      process.env = original;
    }
    expect(lida).not.toHaveBeenCalled();
    expect(connection).not.toHaveBeenCalled();
  });

  it("com sessão e variável válida: iframe com carregamento tardio, sandbox do Google e a linha fixa", async () => {
    vi.stubEnv("LOOKER_REPORT_URL", URL_FALSA);
    const { container } = await renderizar();
    expect(requireAuth).toHaveBeenCalledTimes(1);
    expect(connection).toHaveBeenCalledTimes(1);
    const frames = container.querySelectorAll("iframe");
    expect(frames).toHaveLength(1);
    const frame = frames[0];
    expect(frame.getAttribute("src")).toBe(URL_FALSA);
    expect(frame.getAttribute("loading")).toBe("lazy");
    expect(frame.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(frame.getAttribute("sandbox")).toBe(
      "allow-storage-access-by-user-activation allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox",
    );
    expect(frame.getAttribute("title")).toBe("Relatório de visitas do site");
    expect(screen.getByText("Se o relatório não aparecer, recarregue a página.")).toBeTruthy();
    // Sem botão nem link para abrir o relatório fora do quadro.
    expect(container.querySelectorAll("a")).toHaveLength(0);
  });

  it.each([
    ["variável ausente", undefined],
    ["variável vazia", ""],
    ["http em vez de https", "http://datastudio.google.com/embed/reporting/x"],
    ["host de outro site", "https://exemplo.com/embed/reporting/x"],
    ["link de compartilhar (sem /embed/)", "https://datastudio.google.com/reporting/x"],
  ])("estado vazio: %s", async (_nome, valor) => {
    if (valor === undefined) delete process.env.LOOKER_REPORT_URL;
    else vi.stubEnv("LOOKER_REPORT_URL", valor);
    const { container } = await renderizar();
    expect(container.querySelector("iframe")).toBeNull();
    expect(screen.getByText("O relatório não está disponível agora.")).toBeTruthy();
    expect(screen.queryByText(/recarregue/)).toBeNull();
    // Nada técnico e nenhum valor na tela.
    expect(container.innerHTML).not.toContain("exemplo.com");
    expect(container.innerHTML).not.toContain("datastudio");
    expect(container.innerHTML).not.toContain("LOOKER");
  });
});
