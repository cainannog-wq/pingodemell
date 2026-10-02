import { afterEach, describe, expect, it, vi } from "vitest";
import { unstable_getResponseFromNextConfig } from "next/experimental/testing/server";
import nextConfig from "./next.config";

// X-Robots-Tag (PR noindex-site): o site inteiro fica fora dos buscadores,
// em qualquer domínio, enquanto SITE_INDEXAVEL (src/lib/site/indexacao.ts)
// for false; a homologação (branch deploy da Netlify), sempre.

const ROTAS = [
  "/",
  "/produtos",
  "/produtos/beijinho",
  "/quem-somos",
  "/politica-de-privacidade",
  "/checkout",
  "/robots.txt",
  "/login",
  "/admin/produtos",
  "/api/pedidos",
];
const CONTEXTOS = ["production", "deploy-preview", "branch-deploy", undefined];

async function robots(rota: string, config = nextConfig, host = "pingodemell.netlify.app"): Promise<string | null> {
  const resposta = await unstable_getResponseFromNextConfig({
    url: `https://${host}${rota}`,
    nextConfig: config,
  });
  return resposta.headers.get("x-robots-tag");
}

// next.config.ts com SITE_INDEXAVEL trocado (simula o corte de DNS).
async function configComIndexavel(indexavel: boolean) {
  vi.resetModules();
  vi.doMock("./src/lib/site/indexacao", async (original) => ({
    ...(await original<typeof import("./src/lib/site/indexacao")>()),
    SITE_INDEXAVEL: indexavel,
  }));
  const { default: config } = await import("./next.config");
  vi.doUnmock("./src/lib/site/indexacao");
  return config;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("X-Robots-Tag com a trava de indexação", () => {
  for (const contexto of CONTEXTOS) {
    it(`trava ligada (como está hoje), CONTEXT=${contexto ?? "(sem valor)"}: todas as rotas recebem noindex, nofollow`, async () => {
      vi.stubEnv("CONTEXT", contexto);
      for (const rota of ROTAS) {
        expect(await robots(rota), rota).toBe("noindex, nofollow");
      }
    });
  }

  it("trava ligada: vale em qualquer domínio, não só no da Netlify", async () => {
    vi.stubEnv("CONTEXT", "production");
    for (const host of ["pingodemell.netlify.app", "main--pingodemell.netlify.app", "www.pingodemell.com.br"]) {
      expect(await robots("/", nextConfig, host), host).toBe("noindex, nofollow");
    }
  });

  for (const contexto of ["production", "deploy-preview", undefined]) {
    it(`SITE_INDEXAVEL true, CONTEXT=${contexto ?? "(sem valor)"}: nenhuma rota recebe X-Robots-Tag`, async () => {
      vi.stubEnv("CONTEXT", contexto);
      const config = await configComIndexavel(true);
      for (const rota of ROTAS) {
        expect(await robots(rota, config), rota).toBeNull();
      }
    });
  }

  it("SITE_INDEXAVEL true, CONTEXT=branch-deploy: a homologação continua noindex, nofollow", async () => {
    vi.stubEnv("CONTEXT", "branch-deploy");
    const config = await configComIndexavel(true);
    for (const rota of ROTAS) {
      expect(await robots(rota, config), rota).toBe("noindex, nofollow");
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

// PR confirmacao-e-gravacao: o CONTEXT da Netlify é fixado no build em
// CONTEXTO_NETLIFY (src/lib/pedidos/ambiente.ts decide teste e interruptor).
describe("CONTEXTO_NETLIFY embutido no build", () => {
  for (const [contexto, esperado] of [
    ["production", "production"],
    ["branch-deploy", "branch-deploy"],
    [undefined, ""],
  ] as const) {
    it(`CONTEXT=${contexto ?? "(sem valor)"} vira CONTEXTO_NETLIFY=${JSON.stringify(esperado)}`, async () => {
      vi.stubEnv("CONTEXT", contexto);
      vi.resetModules();
      const { default: config } = await import("./next.config");
      expect(config.env?.CONTEXTO_NETLIFY).toBe(esperado);
    });
  }
});
