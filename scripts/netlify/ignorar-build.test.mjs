import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { arquivosMudados, decidir, podePular } from "./ignorar-build.mjs";

// 0 = a Netlify pula o build; 1 = builda. Errar para "pula" deixa a produção
// sem a mudança; errar para "builda" só gasta um deploy.

describe("podePular: o que fica fora do site", () => {
  it.each([
    [["docs/status-pingo-de-mell.md"]],
    [["CLAUDE.md", "AGENTS.md", "README.md"]],
    [["supabase/seguranca-api.sql"]],
    [["scripts/banco/pedidos.mjs"]],
    [["heartbeat-log.txt"]],
    [[".github/workflows/supabase-heartbeat.yml"]],
    [[".gitignore"]],
    [["docs/a.md", "scripts/b.mjs", ".github/c.yml", "heartbeat-log.txt"]],
  ])("%j: pula", (arquivos) => {
    expect(podePular(arquivos)).toBe(true);
  });

  it.each([
    [["src/app/page.tsx"]],
    [["public/logo.png"]],
    [["package.json"]],
    [["package-lock.json"]],
    [["next.config.ts"]],
    [["netlify.toml"]],
    [["supabase/prod-ca.crt"]],
    [["next-config.test.ts"]],
    [["docs/status-pingo-de-mell.md", "src/app/page.tsx"]],
    [["heartbeat-log.txt", "package.json"]],
  ])("%j: builda", (arquivos) => {
    expect(podePular(arquivos)).toBe(false);
  });

  it("nenhum arquivo mudado: builda (não há o que provar)", () => {
    expect(podePular([])).toBe(false);
  });

  it("nome parecido não engana: builda", () => {
    expect(podePular(["src/docs/x.ts"])).toBe(false);
    expect(podePular(["heartbeat-log.txt.bak"])).toBe(false);
    expect(podePular(["supabase/config.toml"])).toBe(false);
  });
});

describe("decidir: variáveis da Netlify", () => {
  beforeAll(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterAll(() => {
    vi.restoreAllMocks();
  });

  const listar = () => ["docs/a.md"];

  it("sem CACHED_COMMIT_REF (primeiro build da branch): builda", () => {
    expect(decidir({ COMMIT_REF: "b" }, listar)).toBe(1);
  });

  it("CACHED_COMMIT_REF igual ao COMMIT_REF (Clear cache, Trigger deploy): builda", () => {
    expect(decidir({ CACHED_COMMIT_REF: "a", COMMIT_REF: "a" }, listar)).toBe(1);
  });

  it("git diff falha (commit anterior fora do clone): builda", () => {
    const falha = () => {
      throw new Error("bad object");
    };
    expect(decidir({ CACHED_COMMIT_REF: "a", COMMIT_REF: "b" }, falha)).toBe(1);
  });

  it("só docs: pula; com src: builda", () => {
    expect(decidir({ CACHED_COMMIT_REF: "a", COMMIT_REF: "b" }, listar)).toBe(0);
    expect(decidir({ CACHED_COMMIT_REF: "a", COMMIT_REF: "b" }, () => ["docs/a.md", "src/b.ts"])).toBe(1);
  });
});

describe("decidir com um repositório git de verdade", () => {
  let dir;
  const git = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
  const commit = (mensagem) => {
    git("add", "-A");
    git("commit", "-q", "-m", mensagem);
    return git("rev-parse", "HEAD");
  };
  const escrever = (arquivo, conteudo) => {
    mkdirSync(path.dirname(path.join(dir, arquivo)), { recursive: true });
    writeFileSync(path.join(dir, arquivo), conteudo);
  };
  const decidirAqui = (base, atual) =>
    decidir({ CACHED_COMMIT_REF: base, COMMIT_REF: atual }, (b, a) => arquivosMudados(b, a, dir));

  let inicio;
  beforeAll(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    dir = mkdtempSync(path.join(tmpdir(), "ignorar-build-"));
    git("init", "-q");
    git("config", "user.email", "teste@exemplo.com");
    git("config", "user.name", "teste");
    git("config", "commit.gpgsign", "false");
    escrever("src/pagina.ts", "export const a = 1;\n");
    escrever("docs/status.md", "status\n");
    inicio = commit("inicio");
  });
  afterAll(() => {
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });

  it("commit só de docs e heartbeat: pula", () => {
    escrever("docs/status.md", "status 2\n");
    escrever("heartbeat-log.txt", "ping\n");
    const atual = commit("docs");
    expect(decidirAqui(inicio, atual)).toBe(0);
  });

  it("vários commits desde o último build, um deles em src/: builda", () => {
    const base = git("rev-parse", "HEAD");
    escrever("src/pagina.ts", "export const a = 2;\n");
    commit("src");
    escrever("docs/status.md", "status 3\n");
    const atual = commit("docs de novo");
    expect(decidirAqui(base, atual)).toBe(1);
  });

  it("mover arquivo de src/ para docs/: builda (o site perdeu o arquivo)", () => {
    const base = git("rev-parse", "HEAD");
    git("mv", "src/pagina.ts", "docs/pagina.md");
    const atual = commit("move");
    expect(decidirAqui(base, atual)).toBe(1);
  });

  it("commit anterior que não existe no clone: builda", () => {
    const atual = git("rev-parse", "HEAD");
    expect(decidirAqui("0000000000000000000000000000000000000001", atual)).toBe(1);
  });
});
