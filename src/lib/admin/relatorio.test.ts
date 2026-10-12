import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CAMINHO_RELATORIO,
  HOSTS_RELATORIO,
  NOME_VARIAVEL_RELATORIO,
  SANDBOX_RELATORIO,
  lerUrlRelatorio,
  validarUrlRelatorio,
} from "./relatorio";

// Todas as URLs destes testes são inventadas (id de mentira): a URL real do
// relatório nunca aparece em código nem em teste.
const ID = "00000000-0000-0000-0000-000000000000";

afterEach(() => vi.restoreAllMocks());

describe("validarUrlRelatorio", () => {
  it("as constantes: os dois hosts do Google e o caminho de incorporação", () => {
    expect([...HOSTS_RELATORIO]).toEqual(["datastudio.google.com", "lookerstudio.google.com"]);
    expect(CAMINHO_RELATORIO).toBe("/embed/reporting/");
  });

  for (const host of ["datastudio.google.com", "lookerstudio.google.com"]) {
    it(`aceita ${host} com https e /embed/reporting/`, () => {
      const r = validarUrlRelatorio(`https://${host}/embed/reporting/${ID}/page/abc`);
      expect(r).toEqual({ url: `https://${host}/embed/reporting/${ID}/page/abc` });
    });
  }

  it("ignora espaço em volta", () => {
    expect(validarUrlRelatorio(`  https://datastudio.google.com/embed/reporting/${ID}  `)).toHaveProperty("url");
  });

  it.each([
    ["host de outro site", `https://exemplo.com/embed/reporting/${ID}`],
    ["host parecido (sufixo)", `https://datastudio.google.com.exemplo.com/embed/reporting/${ID}`],
    ["host parecido (prefixo)", `https://falso-lookerstudio.google.com/embed/reporting/${ID}`],
    ["subdomínio do Google", `https://www.google.com/embed/reporting/${ID}`],
    ["credencial na URL", `https://usuario:senha@datastudio.google.com/embed/reporting/${ID}`],
    ["porta", `https://datastudio.google.com:8443/embed/reporting/${ID}`],
  ])("recusa %s", (_nome, url) => {
    expect(validarUrlRelatorio(url)).toEqual({ motivo: "invalida" });
  });

  it("exige https", () => {
    expect(validarUrlRelatorio(`http://datastudio.google.com/embed/reporting/${ID}`)).toEqual({ motivo: "invalida" });
    expect(validarUrlRelatorio("javascript:alert(1)//datastudio.google.com/embed/reporting/")).toEqual({ motivo: "invalida" });
  });

  it("exige o caminho de incorporação (o link de compartilhar não serve)", () => {
    expect(validarUrlRelatorio(`https://datastudio.google.com/reporting/${ID}/page/abc`)).toEqual({ motivo: "invalida" });
    expect(validarUrlRelatorio(`https://lookerstudio.google.com/embed/${ID}`)).toEqual({ motivo: "invalida" });
    expect(validarUrlRelatorio(`https://datastudio.google.com/x/embed/reporting/${ID}`)).toEqual({ motivo: "invalida" });
  });

  it("ausente, vazio ou só espaço: ausente; texto que não é URL: inválida", () => {
    expect(validarUrlRelatorio(undefined)).toEqual({ motivo: "ausente" });
    expect(validarUrlRelatorio("")).toEqual({ motivo: "ausente" });
    expect(validarUrlRelatorio("   ")).toEqual({ motivo: "ausente" });
    expect(validarUrlRelatorio("isto não é uma url")).toEqual({ motivo: "invalida" });
  });
});

describe("lerUrlRelatorio", () => {
  it("lê a variável LOOKER_REPORT_URL do ambiente dado", () => {
    expect(NOME_VARIAVEL_RELATORIO).toBe("LOOKER_REPORT_URL");
    const url = `https://datastudio.google.com/embed/reporting/${ID}`;
    expect(lerUrlRelatorio({ LOOKER_REPORT_URL: url })).toBe(url);
  });

  it("sem variável ou inválida: null, e o log traz o motivo e nunca o valor", () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const valorInvalido = "https://exemplo.com/segredo-que-nao-pode-ir-ao-log";
    expect(lerUrlRelatorio({})).toBeNull();
    expect(lerUrlRelatorio({ LOOKER_REPORT_URL: valorInvalido })).toBeNull();
    expect(aviso).toHaveBeenCalledTimes(2);
    const tudo = aviso.mock.calls.flat().join("\n");
    expect(tudo).toContain("ausente");
    expect(tudo).toContain("inválido");
    expect(tudo).not.toContain("segredo-que-nao-pode-ir-ao-log");
    expect(tudo).not.toContain("exemplo.com");
  });
});

describe("sandbox", () => {
  it("é o conjunto padrão do código de incorporação do Google, nada além dele", () => {
    expect(SANDBOX_RELATORIO.split(" ")).toEqual([
      "allow-storage-access-by-user-activation",
      "allow-scripts",
      "allow-same-origin",
      "allow-popups",
      "allow-popups-to-escape-sandbox",
    ]);
  });
});
