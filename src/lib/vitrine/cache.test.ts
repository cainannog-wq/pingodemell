import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

// Cache da vitrine (PR perf/vitrine-consultas-cache): etiqueta, prazo e o
// que deixa Home e interna serem guardadas na borda.

const { unstableCache } = vi.hoisted(() => ({ unstableCache: vi.fn(<T,>(leitura: T) => leitura) }));
vi.mock("next/cache", () => ({ unstable_cache: unstableCache, updateTag: vi.fn() }));

const raiz = path.resolve(__dirname, "..", "..", "..");
const ler = (relativo: string) => readFileSync(path.join(raiz, relativo), "utf8");
const HOME = "src/app/(site)/page.tsx";
const INTERNA = "src/app/(site)/produtos/[slug]/page.tsx";

describe("emCacheDaVitrine", () => {
  it("guarda com a etiqueta 'vitrine' e o prazo de 60 s", async () => {
    const { emCacheDaVitrine, ETIQUETA_VITRINE, PRAZO_VITRINE_SEGUNDOS } = await import("./cache");
    expect(ETIQUETA_VITRINE).toBe("vitrine");
    expect(PRAZO_VITRINE_SEGUNDOS).toBe(60);
    const leitura = async () => 1;
    emCacheDaVitrine(leitura, "teste");
    expect(unstableCache).toHaveBeenCalledWith(leitura, ["teste"], { tags: ["vitrine"], revalidate: 60 });
  });

  it("invalidarVitrine expira a etiqueta 'vitrine' na hora (updateTag)", async () => {
    const { updateTag } = await import("next/cache");
    const { invalidarVitrine } = await import("./cache");
    invalidarVitrine();
    expect(updateTag).toHaveBeenCalledWith("vitrine");
  });
});

describe("Home e interna guardadas na borda", () => {
  it("o revalidate escrito nas duas páginas é o prazo da vitrine", async () => {
    const { PRAZO_VITRINE_SEGUNDOS } = await import("./cache");
    for (const pagina of [HOME, INTERNA]) {
      const m = ler(pagina).match(/^export const revalidate = (\d+);$/m);
      expect(m, `${pagina} sem export const revalidate`).not.toBeNull();
      expect(Number(m![1])).toBe(PRAZO_VITRINE_SEGUNDOS);
    }
  });

  it("nenhuma das duas lê cookie, cabeçalho, sessão ou a busca da URL no servidor", () => {
    for (const pagina of [HOME, INTERNA]) {
      const fonte = ler(pagina);
      expect(fonte).not.toMatch(/searchParams|next\/headers|cookies\(|headers\(|supabase\/server|connection\(/);
    }
  });

  it("a interna é gerada na primeira visita (generateStaticParams vazio)", () => {
    expect(ler(INTERNA)).toMatch(/export async function generateStaticParams\(\) \{\s*return \[\];\s*\}/);
  });

  it("a leitura da vitrine nunca usa o cliente com sessão nem cookie", () => {
    const pasta = path.join(raiz, "src/lib/vitrine");
    for (const arquivo of readdirSync(pasta).filter((a) => a.endsWith(".ts") && !a.includes(".test."))) {
      const fonte = readFileSync(path.join(pasta, arquivo), "utf8");
      expect(fonte, arquivo).not.toMatch(/supabase\/server|next\/headers|cookies\(/);
    }
  });
});
