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

  it("os outros cabeçalhos de segurança continuam em todos os contextos", async () => {
    for (const contexto of ["production", "branch-deploy"]) {
      vi.stubEnv("CONTEXT", contexto);
      const resposta = await unstable_getResponseFromNextConfig({ url: "https://pingodemell.netlify.app/", nextConfig });
      expect(resposta.headers.get("x-frame-options")).toBe("DENY");
      expect(resposta.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    }
  });
});
