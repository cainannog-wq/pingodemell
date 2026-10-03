import { afterEach, describe, expect, it, vi } from "vitest";

// next/font/google só funciona com o compilador do Next; no teste basta a
// classe da variável.
vi.mock("next/font/google", () => {
  const fonte = () => ({ variable: "fonte", className: "fonte" });
  return { Geist: fonte, Geist_Mono: fonte, Merriweather: fonte, Nunito: fonte, Yellowtail: fonte };
});

async function metadataDoLayout(indexavel?: boolean) {
  vi.resetModules();
  if (indexavel !== undefined) {
    vi.doMock("@/lib/site/indexacao", async (original) => ({
      ...(await original<typeof import("@/lib/site/indexacao")>()),
      SITE_INDEXAVEL: indexavel,
    }));
  }
  const { metadata } = await import("./layout");
  return metadata;
}

afterEach(() => {
  vi.doUnmock("@/lib/site/indexacao");
});

describe("meta robots do layout raiz (PR noindex-site)", () => {
  it("com a constante como está (false): noindex, nofollow", async () => {
    expect((await metadataDoLayout()).robots).toEqual({ index: false, follow: false });
  });

  it("com SITE_INDEXAVEL true: sem robots (padrão do Next, indexável)", async () => {
    expect((await metadataDoLayout(true)).robots).toBeUndefined();
  });
});

describe("título, descrição e endereço base do layout raiz (PR fase4/seo-metadados)", () => {
  it("título e descrição padrão do site; metadataBase do SITE_URL; sem canonical nem Open Graph herdáveis", async () => {
    const metadata = await metadataDoLayout();
    expect(metadata.title).toBe("Pingo de Mell | Bolos e doces em Fazenda Rio Grande e Curitiba");
    expect(metadata.description).toBe(
      "Bolos de aniversário, doces e salgados artesanais para festas em Fazenda Rio Grande e Curitiba. Monte seu pedido no site e finalize pelo WhatsApp."
    );
    expect(String(metadata.metadataBase)).toBe("https://pingodemell.netlify.app/");
    expect(metadata.alternates).toBeUndefined();
    expect(metadata.openGraph).toBeUndefined();
  });
});
