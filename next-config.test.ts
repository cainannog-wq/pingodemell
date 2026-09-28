import { afterEach, describe, expect, it, vi } from "vitest";
import { unstable_getResponseFromNextConfig } from "next/experimental/testing/server";
import nextConfig from "./next.config";

// X-Robots-Tag só na homologação (branch deploy da Netlify). A produção
// nunca pode receber noindex: sairia do Google.

const ROTAS = ["/", "/produtos", "/login", "/admin/produtos", "/api/pedidos"];

async function robots(rota: string): Promise<string | null> {
  const resposta = await unstable_getResponseFromNextConfig({
    url: `https://pingodemell.netlify.app${rota}`,
    nextConfig,
  });
  return resposta.headers.get("x-robots-tag");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("X-Robots-Tag por contexto da Netlify", () => {
  for (const contexto of ["production", "deploy-preview", undefined]) {
    it(`CONTEXT=${contexto ?? "(sem valor)"}: nenhuma rota recebe X-Robots-Tag`, async () => {
      vi.stubEnv("CONTEXT", contexto);
      for (const rota of ROTAS) {
        expect(await robots(rota), rota).toBeNull();
      }
    });
  }

  it("CONTEXT=branch-deploy: todas as rotas recebem noindex, nofollow", async () => {
    vi.stubEnv("CONTEXT", "branch-deploy");
    for (const rota of ROTAS) {
      expect(await robots(rota), rota).toBe("noindex, nofollow");
    }
  });

  it("commit servido aparece em X-Homologacao-Commit só na homologação", async () => {
    vi.stubEnv("COMMIT_REF", "c18a492c693f5e38f29aaf043ec6fdd40d72c49a");
    for (const [contexto, esperado] of [
      ["production", null],
      ["deploy-preview", null],
      ["branch-deploy", "c18a492c693f5e38f29aaf043ec6fdd40d72c49a"],
    ] as const) {
      vi.stubEnv("CONTEXT", contexto);
      const resposta = await unstable_getResponseFromNextConfig({ url: "https://pingodemell.netlify.app/", nextConfig });
      expect(resposta.headers.get("x-homologacao-commit"), contexto).toBe(esperado);
    }
  });

  it('registro de tempo do Salvar (MEDIR_TEMPOS_ADMIN) só é ligado no build da homologação', async () => {
    for (const [contexto, esperado] of [
      ["production", ""],
      ["deploy-preview", ""],
      [undefined, ""],
      ["branch-deploy", "1"],
    ] as const) {
      vi.stubEnv("CONTEXT", contexto);
      vi.resetModules();
      const { default: config } = await import("./next.config");
      expect(config.env?.MEDIR_TEMPOS_ADMIN, String(contexto)).toBe(esperado);
    }
  });

  it("os outros cabeçalhos de segurança continuam em todos os contextos", async () => {
    for (const contexto of ["production", "branch-deploy"]) {
      vi.stubEnv("CONTEXT", contexto);
      const resposta = await unstable_getResponseFromNextConfig({ url: "https://pingodemell.netlify.app/", nextConfig });
      expect(resposta.headers.get("x-frame-options")).toBe("DENY");
      expect(resposta.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    }
  });
});
