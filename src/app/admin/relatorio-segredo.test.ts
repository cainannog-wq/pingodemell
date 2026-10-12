import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// A URL do relatório é segredo (quem tem a URL vê os números). Estes testes
// leem o código como texto e seguram as regras que a mantêm só no servidor.

const RAIZ = process.cwd();

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (nome === "node_modules" || nome === ".next") return [];
    return statSync(caminho).isDirectory() ? arquivos(caminho) : [caminho];
  });
}
const codigo = arquivos(join(RAIZ, "src")).filter((f) => /\.(ts|tsx)$/.test(f));
const rel = (f: string) => relative(RAIZ, f).replace(/\\/g, "/");
const ler = (f: string) => readFileSync(f, "utf8");
const ehDeCliente = (f: string) => /^["']use client["']/m.test(ler(f).slice(0, 300));

describe("segredo da URL do relatório", () => {
  it("a variável só é citada em src/lib/admin/relatorio.ts e nos testes", () => {
    const citam = codigo.filter((f) => ler(f).includes("LOOKER_REPORT_URL")).map(rel).sort();
    const permitidos = [
      "src/app/admin/inicio.test.tsx",
      "src/app/admin/relatorio-segredo.test.ts",
      "src/lib/admin/relatorio.test.ts",
      "src/lib/admin/relatorio.ts",
    ];
    expect(citam.filter((f) => !permitidos.includes(f))).toEqual([]);
    expect(citam).toContain("src/lib/admin/relatorio.ts");
  });

  it("não há variável NEXT_PUBLIC_ do relatório e o next.config.ts não a copia para o navegador", () => {
    for (const f of codigo) expect(ler(f), rel(f)).not.toMatch(/NEXT_PUBLIC_\w*(LOOKER|REPORT|RELATORIO)/i);
    const config = readFileSync(join(RAIZ, "next.config.ts"), "utf8");
    expect(config).not.toMatch(/LOOKER/i);
    expect(config).not.toMatch(/NEXT_PUBLIC_\w*(LOOKER|REPORT|RELATORIO)/i);
  });

  it("relatorio.ts é só de servidor (server-only)", () => {
    expect(ler(join(RAIZ, "src/lib/admin/relatorio.ts"))).toMatch(/^import "server-only";/m);
  });

  it("nenhum arquivo de cliente importa o módulo do relatório", () => {
    const clientes = codigo.filter(ehDeCliente);
    expect(clientes.length).toBeGreaterThan(0); // controle: a varredura enxerga os de cliente
    for (const f of clientes) {
      expect(ler(f), rel(f)).not.toMatch(/admin\/relatorio|quadro-relatorio/);
    }
  });

  it("o quadro e a página do relatório são Server Components", () => {
    expect(ehDeCliente(join(RAIZ, "src/app/admin/quadro-relatorio.tsx"))).toBe(false);
    expect(ehDeCliente(join(RAIZ, "src/app/admin/page.tsx"))).toBe(false);
  });

  it("a página checa a sessão e chama connection() antes de ler a URL", () => {
    const p = ler(join(RAIZ, "src/app/admin/page.tsx"));
    const auth = p.indexOf("await requireAuth()");
    const conn = p.indexOf("await connection()");
    const leitura = p.indexOf("lerUrlRelatorio()");
    expect(auth).toBeGreaterThan(-1);
    expect(conn).toBeGreaterThan(auth);
    expect(leitura).toBeGreaterThan(conn);
  });
});

describe("admin fora do banner e da etiqueta do GA4", () => {
  it("nada em src/app/admin nem em src/app/login importa consentimento, analítica ou o SiteChrome", () => {
    const doAdmin = codigo.filter((f) => /^src\/app\/(admin|login)\//.test(rel(f)) && !/\.test\.tsx?$/.test(f));
    expect(doAdmin.length).toBeGreaterThan(5);
    for (const f of doAdmin) {
      expect(ler(f), rel(f)).not.toMatch(/consentimento|analitica|SiteChrome|gtag|googletagmanager/i);
    }
  });

  it("o layout raiz não monta banner nem etiqueta", () => {
    expect(ler(join(RAIZ, "src/app/layout.tsx"))).not.toMatch(/consentimento|analitica|SiteChrome|gtag/i);
  });
});
