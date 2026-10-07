// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHAVE_CONSENTIMENTO, reiniciarConsentimentoParaTeste } from "@/lib/consentimento/consentimento";
import * as gtag from "@/lib/analitica/gtag";
import { VERSAO_POLITICA } from "@/lib/site/politica-versao";
import { BannerConsentimento } from "./BannerConsentimento";
import { ConsentimentoProvider } from "./ConsentimentoProvider";
import { BotaoPreferencias } from "./BotaoPreferencias";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const ID = "G-TESTE00000";
const TEXTO = "Usamos cookies para melhorar a sua experiência. Saiba mais na Política de Privacidade.";

function Tela() {
  return (
    <ConsentimentoProvider>
      <BannerConsentimento />
      <main>
        <p>Conteúdo</p>
        <BotaoPreferencias />
      </main>
    </ConsentimentoProvider>
  );
}

function comId(id = ID) {
  vi.stubEnv("GA4_ID", id);
  vi.stubEnv("CONTEXTO_NETLIFY", "branch-deploy");
}

function salvo(escolha: "aceito" | "recusado", data = "2026-10-05", versaoPolitica = VERSAO_POLITICA) {
  window.localStorage.setItem(CHAVE_CONSENTIMENTO, JSON.stringify({ versao: 1, escolha, data, versaoPolitica }));
}

const banner = () => screen.queryByRole("region", { name: "Preferências de privacidade" });

beforeEach(() => {
  window.localStorage.clear();
  reiniciarConsentimentoParaTeste();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-06T01:30:00Z")); // 05/10, 22h30 de Brasília
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("sem ID do GA4 efetivo", () => {
  it.each([
    ["ausente", ""],
    ["formato errado", "G-abc"],
  ])("%s: sem banner, sem link e nada gravado", (_, id) => {
    comId(id);
    render(<Tela />);
    expect(banner()).toBeNull();
    expect(screen.queryByRole("button", { name: "Preferências de privacidade" })).toBeNull();
    expect(Object.keys(window.localStorage)).toEqual([]);
  });

  it("produção com GA4_ID e versaoPolitica 1: sem banner nem link (trava por versão)", async () => {
    vi.stubEnv("GA4_ID", ID);
    vi.stubEnv("CONTEXTO_NETLIFY", "production");
    vi.resetModules();
    vi.doMock("@/lib/site/politica-versao", () => ({ VERSAO_POLITICA: 1 }));
    try {
      const { ConsentimentoProvider: Provider1 } = await import("./ConsentimentoProvider");
      const { BannerConsentimento: Banner1 } = await import("./BannerConsentimento");
      const { BotaoPreferencias: Botao1 } = await import("./BotaoPreferencias");
      render(
        <Provider1>
          <Banner1 />
          <main>
            <Botao1 />
          </main>
        </Provider1>
      );
      expect(banner()).toBeNull();
      expect(screen.queryByRole("button", { name: "Preferências de privacidade" })).toBeNull();
    } finally {
      vi.doUnmock("@/lib/site/politica-versao");
      vi.resetModules();
    }
  });

  it("produção sem GA4_ID: sem banner nem link", () => {
    vi.stubEnv("GA4_ID", "");
    vi.stubEnv("CONTEXTO_NETLIFY", "production");
    render(<Tela />);
    expect(banner()).toBeNull();
    expect(screen.queryByRole("button", { name: "Preferências de privacidade" })).toBeNull();
  });
});

describe("produção com GA4_ID e a versão vigente (3)", () => {
  it("banner e link aparecem (a trava por versão não segura mais)", () => {
    vi.stubEnv("GA4_ID", ID);
    vi.stubEnv("CONTEXTO_NETLIFY", "production");
    render(<Tela />);
    expect(banner()).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preferências de privacidade" })).toBeInTheDocument();
  });
});

describe("com ID do GA4 efetivo", () => {
  it("sem escolha: banner com o texto fixo, link da Política e os dois botões iguais", () => {
    comId();
    render(<Tela />);
    const regiao = banner()!;
    expect(regiao).toBeInTheDocument();
    expect(regiao.querySelector("p")).toHaveTextContent(TEXTO);
    expect(screen.getByRole("link", { name: "Política de Privacidade" })).toHaveAttribute("href", "/politica-de-privacidade");
    const aceitar = screen.getByRole("button", { name: "Aceitar" });
    const recusar = screen.getByRole("button", { name: "Recusar" });
    // Mesmo componente, mesma variante e mesmo tamanho: o mesmo estilo.
    expect(aceitar.getAttribute("style")).toBe(recusar.getAttribute("style"));
    expect(aceitar).not.toHaveAttribute("aria-pressed");
    expect(screen.queryByText(/Sua escolha atual/)).toBeNull();
    // Não rouba o foco ao aparecer.
    expect(document.activeElement).toBe(document.body);
  });

  it.each([
    ["Aceitar", "aceito"],
    ["Recusar", "recusado"],
  ])("%s grava a escolha e o banner some", async (botao, escolha) => {
    comId();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Tela />);
    await user.click(screen.getByRole("button", { name: botao }));
    expect(JSON.parse(window.localStorage.getItem(CHAVE_CONSENTIMENTO)!)).toEqual({
      versao: 1,
      escolha,
      data: "2026-10-05",
      versaoPolitica: VERSAO_POLITICA,
    });
    expect(banner()).toBeNull();
    expect(screen.getByRole("button", { name: "Preferências de privacidade" })).toBeInTheDocument();
  });

  it("escolha válida: sem banner; vencida (181 dias) ou de outra versão da Política: banner de novo", () => {
    comId();
    salvo("recusado", "2026-04-08"); // 180 dias antes de 05/10/2026
    const { unmount } = render(<Tela />);
    expect(banner()).toBeNull();
    unmount();

    window.localStorage.clear();
    reiniciarConsentimentoParaTeste();
    salvo("recusado", "2026-04-07"); // 181 dias
    const segundo = render(<Tela />);
    expect(banner()).toBeInTheDocument();
    segundo.unmount();

    window.localStorage.clear();
    reiniciarConsentimentoParaTeste();
    salvo("aceito", "2026-10-05", VERSAO_POLITICA + 1);
    render(<Tela />);
    expect(banner()).toBeInTheDocument();
  });

  it("reabertura pelo botão da Política: escolha atual visível, foco no banner, e o foco volta ao botão ao escolher", async () => {
    comId();
    salvo("recusado");
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Tela />);
    const link = screen.getByRole("button", { name: "Preferências de privacidade" });
    await user.click(link);

    const regiao = banner()!;
    expect(regiao).toBeInTheDocument();
    expect(document.activeElement).toBe(regiao);
    expect(screen.getByText("Sua escolha atual: Recusado")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aceitar" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Recusar" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Aceitar" }));
    expect(banner()).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(CHAVE_CONSENTIMENTO)!).escolha).toBe("aceito");
    expect(document.activeElement).toBe(link);

    await user.click(link);
    expect(screen.getByText("Sua escolha atual: Aceito")).toBeInTheDocument();
  });

  it("revogar: recusar pela reabertura depois de ter aceitado chama a revogação com o ID (desliga, apaga _ga e recarrega)", async () => {
    comId();
    salvo("aceito");
    const revogar = vi.spyOn(gtag, "revogar").mockImplementation(() => {});
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Tela />);
    await user.click(screen.getByRole("button", { name: "Preferências de privacidade" }));
    await user.click(screen.getByRole("button", { name: "Recusar" }));
    expect(revogar).toHaveBeenCalledTimes(1);
    expect(revogar).toHaveBeenCalledWith(ID);
    expect(JSON.parse(window.localStorage.getItem(CHAVE_CONSENTIMENTO)!).escolha).toBe("recusado");
  });

  it("recusar sem ter aceitado antes não revoga nada", async () => {
    comId();
    const revogar = vi.spyOn(gtag, "revogar").mockImplementation(() => {});
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Tela />);
    await user.click(screen.getByRole("button", { name: "Recusar" }));
    expect(revogar).not.toHaveBeenCalled();
  });

  it("antes de montar não há banner: o HTML do servidor é igual sem e com ID, e a hidratação não reclama", async () => {
    vi.stubEnv("GA4_ID", "");
    const semId = renderToString(<Tela />);
    comId();
    const html = renderToString(<Tela />);
    expect(html).toBe(semId);
    expect(html).not.toContain("Usamos cookies");

    const erros = vi.spyOn(console, "error").mockImplementation(() => {});
    const raiz = document.createElement("div");
    raiz.innerHTML = html;
    document.body.appendChild(raiz);
    let app: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      app = hydrateRoot(raiz, <Tela />);
    });
    expect(erros).not.toHaveBeenCalled();
    expect(raiz.querySelector('[aria-label="Preferências de privacidade"]')).not.toBeNull();
    await act(async () => app?.unmount());
    raiz.remove();
  });
});
