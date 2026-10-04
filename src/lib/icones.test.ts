import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ligadurasWoff2, tabelasWoff2 } from "../../scripts/fonte-icones/ligaduras.mjs";
import manifesto from "../fonts/material-symbols-rounded/manifesto.json";
import { ICONES } from "./icones";

// Fonte de ícones hospedada (PR fase4/fonte-icones-hospedada). Quem
// acrescenta um ícone muda src/lib/icones.ts e roda
// `node scripts/fonte-icones/gerar.mjs`; até lá estes testes falham.

const RAIZ = path.resolve(__dirname, "..", "..");
const PASTA_FONTE = path.join(RAIZ, "src", "fonts", "material-symbols-rounded");
const fonte = readFileSync(path.join(PASTA_FONTE, manifesto.arquivo));

describe("fonte de ícones: arquivo no repositório", () => {
  it("lista tipada em ordem alfabética e sem repetição (o icon_names do Google pede assim)", () => {
    expect([...ICONES]).toEqual([...ICONES].sort());
    expect(new Set(ICONES).size).toBe(ICONES.length);
  });

  it("manifesto com a mesma lista da lista tipada", () => {
    expect(manifesto.nomes).toEqual([...ICONES]);
    expect(manifesto.url_css).toContain(`icon_names=${ICONES.join(",")}`);
    expect(manifesto.url_css).toContain("Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,1,0");
  });

  it("sha256 e tamanho do woff2 conferem com o manifesto", () => {
    expect(createHash("sha256").update(fonte).digest("hex")).toBe(manifesto.sha256);
    expect(fonte.length).toBe(manifesto.bytes);
  });

  it("instância fixa (sem eixo variável): os eixos 24, 400, 1, 0 são os únicos", () => {
    expect(tabelasWoff2(fonte).has("fvar")).toBe(false);
  });

  it("cada nome da lista vira ícone no arquivo (ligadura na tabela GSUB)", () => {
    const ligaduras = ligadurasWoff2(fonte);
    const faltando = ICONES.filter((nome) => !ligaduras.viraIcone(nome));
    expect(faltando).toEqual([]);
    // O leitor não é vazio: nome fora da lista não vira ícone.
    expect(ligaduras.viraIcone("shopping_cart")).toBe(false);
  });

  it("licença da fonte junto do arquivo", () => {
    const licenca = readFileSync(path.join(PASTA_FONTE, "LICENSE"), "utf8");
    expect(licenca).toContain("Apache License");
    expect(licenca).toContain("Version 2.0, January 2004");
  });
});

// Varredura do código: acha nomes de ícone escritos no código e confere com
// a lista. O tipo IconeNome já recusa nome fora da lista na compilação;
// esta varredura é a segunda trava e também aponta nome sobrando na lista.
//
// Pega: <Icon name=...> e <ButtonIcon name=...>; iconLeft, iconRight, icon e
// icone como atributo (texto ou expressão com textos, inclusive ternário);
// icon e icone como chave de objeto com texto. Num ternário, o texto
// comparado (=== "x" / !== "x") não conta como nome.
// Não pega: nome montado por concatenação ou template, nome que chega de
// dado (banco, JSON, URL), nome passado por variável com outro nome de
// propriedade, e ícone desenhado por CSS (content com o nome).

const ATRIBUTO = /\b(iconLeft|iconRight|icon|icone)\s*=\s*(?:"([^"]*)"|\{([^}]*)\})/g;
const COMPONENTE = /<(?:Icon|ButtonIcon)\b[^>]*?\bname\s*=\s*(?:"([^"]*)"|\{([^}]*)\})/g;
const CHAVE = /\b(icon|icone)\s*:\s*"([^"]*)"/g;

type Uso = { nome: string; onde: string; botao: boolean };

function textos(expr: string): string[] {
  return [...expr.replace(/[!=]==\s*"[^"]*"/g, "").matchAll(/"([^"]*)"/g)].map((m) => m[1]);
}

function usosDeIcone(codigo: string, arquivo: string): Uso[] {
  const usos: Uso[] = [];
  const linha = (i: number) => `${arquivo}:${codigo.slice(0, i).split("\n").length}`;
  for (const m of codigo.matchAll(ATRIBUTO)) {
    const botao = m[1] === "iconLeft" || m[1] === "iconRight";
    for (const nome of m[2] !== undefined ? [m[2]] : textos(m[3])) usos.push({ nome, onde: linha(m.index), botao });
  }
  for (const m of codigo.matchAll(COMPONENTE)) {
    for (const nome of m[1] !== undefined ? [m[1]] : textos(m[2])) usos.push({ nome, onde: linha(m.index), botao: false });
  }
  for (const m of codigo.matchAll(CHAVE)) usos.push({ nome: m[2], onde: linha(m.index), botao: false });
  return usos;
}

function arquivosDoSite(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = path.join(pasta, nome);
    if (statSync(caminho).isDirectory()) return arquivosDoSite(caminho);
    return /\.tsx?$/.test(nome) && !/\.test\.tsx?$/.test(nome) ? [caminho] : [];
  });
}

describe("fonte de ícones: varredura do código", () => {
  const usos = arquivosDoSite(path.join(RAIZ, "src")).flatMap((arquivo) =>
    usosDeIcone(readFileSync(arquivo, "utf8"), path.relative(RAIZ, arquivo).replaceAll("\\", "/")),
  );
  const lista = new Set<string>(ICONES);

  it("a varredura pega os formatos conhecidos (inclusive ternário) e ignora o texto comparado", () => {
    const amostra = [
      '<Icon name="cake" size={20} />',
      '<Icon name={cor === "ok" ? "check_circle" : "nao_existe"} />',
      '<Button iconLeft="whatsapp" iconRight={x === "enviando" ? undefined : "arrow_forward"}>',
      '<InfoRow icon="person" label="Nome">',
      'const C = [{ icone: "favorite" }, { icon: "schedule" }];',
    ].join("\n");
    expect(usosDeIcone(amostra, "amostra").map((u) => u.nome)).toEqual([
      "whatsapp",
      "arrow_forward",
      "person",
      "cake",
      "check_circle",
      "nao_existe",
      "favorite",
      "schedule",
    ]);
  });

  it("todo ícone escrito no código está na lista (whatsapp só nos botões: é a marca em imagem)", () => {
    const fora = usos.filter((u) => !lista.has(u.nome) && !(u.botao && u.nome === "whatsapp"));
    expect(fora.map((u) => `${u.onde} ${u.nome}`)).toEqual([]);
    expect(usos.length).toBeGreaterThan(150);
  });

  it("a lista não tem nome sobrando (cada um aparece no código)", () => {
    const usados = new Set(usos.map((u) => u.nome));
    expect(ICONES.filter((nome) => !usados.has(nome))).toEqual([]);
  });
});
