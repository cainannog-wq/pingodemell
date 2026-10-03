import { afterEach, describe, expect, it, vi } from "vitest";

// O robots.txt libera tudo mesmo com a trava ligada: com "Disallow: /" o
// Google não visitaria as páginas e não leria o noindex (ver robots.ts).

async function robotsCom(indexavel?: boolean) {
  vi.resetModules();
  if (indexavel !== undefined) {
    vi.doMock("@/lib/site/indexacao", async (original) => ({
      ...(await original<typeof import("@/lib/site/indexacao")>()),
      SITE_INDEXAVEL: indexavel,
    }));
  }
  const { default: robots } = await import("./robots");
  return robots();
}

afterEach(() => {
  vi.doUnmock("@/lib/site/indexacao");
});

function regraUnica(rules: Awaited<ReturnType<typeof robotsCom>>["rules"]) {
  const lista = Array.isArray(rules) ? rules : [rules];
  expect(lista).toHaveLength(1);
  return lista[0];
}

describe("robots.txt (PR noindex-site e fase4/seo-metadados)", () => {
  it("com SITE_INDEXAVEL false (como está): Allow para /, nenhum Disallow e sem sitemap", async () => {
    const { SITE_INDEXAVEL } = await import("@/lib/site/indexacao");
    expect(SITE_INDEXAVEL).toBe(false);
    const r = await robotsCom();
    const regra = regraUnica(r.rules);
    expect(regra.userAgent).toBe("*");
    expect(regra.allow).toBe("/");
    expect([regra.disallow ?? []].flat()).toHaveLength(0);
    expect(r.sitemap).toBeUndefined();
    expect(Object.keys(r).sort()).toEqual(["rules"]);
  });

  it("com SITE_INDEXAVEL true: as mesmas regras e a linha Sitemap com o endereço absoluto", async () => {
    const r = await robotsCom(true);
    const regra = regraUnica(r.rules);
    expect(regra.allow).toBe("/");
    expect([regra.disallow ?? []].flat()).toHaveLength(0);
    expect(r.sitemap).toBe("https://pingodemell.netlify.app/sitemap.xml");
  });
});
