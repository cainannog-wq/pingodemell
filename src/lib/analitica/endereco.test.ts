import { describe, expect, it } from "vitest";
import { CATEGORIAS } from "@/lib/produtos/categorias";
import { caminhoLimpo, enderecoLimpo, referrerLimpo } from "./endereco";

const ORIGEM = "https://homologacao--pingodemell.netlify.app";

describe("endereço limpo para o GA4", () => {
  it.each([
    ["/produtos", "?categoria=bolos", "/produtos?categoria=bolos"],
    ["/produtos", "?categoria=adicionais", "/produtos?categoria=adicionais"],
    ["/produtos", "?categoria=bento-cake", "/produtos?categoria=bento-cake"],
    ["/produtos", "?categoria=texto", "/produtos"],
    ["/produtos", "?categoria=Bolos", "/produtos"],
    ["/produtos", "?categoria=", "/produtos"],
    ["/produtos", "?categoria=bolos&utm_source=x", "/produtos?categoria=bolos"],
    ["/produtos", "?utm_source=x&categoria=doces&nome=Maria", "/produtos?categoria=doces"],
    ["/produtos/brigadeiro-gourmet", "?editar=abc", "/produtos/brigadeiro-gourmet"],
    ["/checkout", "", "/checkout"],
    ["/", "?q=telefone", "/"],
  ])("%s%s -> %s", (caminho, busca, esperado) => {
    expect(caminhoLimpo(caminho, busca, false)).toBe(esperado);
  });

  it("todas as categorias da lista única passam", () => {
    for (const c of CATEGORIAS) expect(caminhoLimpo("/produtos", `?categoria=${c.parametro}`, false)).toBe(`/produtos?categoria=${c.parametro}`);
  });

  it("o fragmento nunca entra (location.pathname e location.search não o trazem; a URL inteira também sai limpa)", () => {
    const url = new URL(`${ORIGEM}/quem-somos?x=1#contato`);
    expect(enderecoLimpo(url.origin, url.pathname, url.search, false)).toBe(`${ORIGEM}/quem-somos`);
    expect(enderecoLimpo(url.origin, url.pathname, url.search, false)).not.toContain("#");
  });

  it("404: caminho fixo /404, sem o endereço digitado nem a query", () => {
    expect(caminhoLimpo("/meu-telefone-41999999999", "?categoria=bolos", true)).toBe("/404");
    expect(enderecoLimpo(ORIGEM, "/qualquer", "", true)).toBe(`${ORIGEM}/404`);
  });

  it("a origem é a recebida (a da página), nunca outra", () => {
    expect(enderecoLimpo("http://localhost:3998", "/", "", false)).toBe("http://localhost:3998/");
    expect(enderecoLimpo(ORIGEM, "/", "", false)).toBe(`${ORIGEM}/`);
  });
});

describe("page_referrer limpo", () => {
  it("do próprio site: a mesma limpeza", () => {
    expect(referrerLimpo(`${ORIGEM}/produtos/brigadeiro-gourmet?editar=abc#x`, ORIGEM)).toBe(`${ORIGEM}/produtos/brigadeiro-gourmet`);
    expect(referrerLimpo(`${ORIGEM}/produtos?categoria=texto`, ORIGEM)).toBe(`${ORIGEM}/produtos`);
    expect(referrerLimpo(`${ORIGEM}/produtos?categoria=kits`, ORIGEM)).toBe(`${ORIGEM}/produtos?categoria=kits`);
  });
  it("de fora: só a origem, sem caminho nem query", () => {
    expect(referrerLimpo("https://l.instagram.com/?u=https%3A%2F%2Fpingodemell&e=abc", ORIGEM)).toBe("https://l.instagram.com/");
    expect(referrerLimpo("https://www.google.com/search?q=bolo", ORIGEM)).toBe("https://www.google.com/");
  });
  it("sem referrer, inválido ou de outro protocolo: vazio", () => {
    expect(referrerLimpo("", ORIGEM)).toBe("");
    expect(referrerLimpo("nao e url", ORIGEM)).toBe("");
    expect(referrerLimpo("android-app://com.whatsapp/", ORIGEM)).toBe("");
  });
});
