import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ARQUIVOS, lerCsv, menorTamanho, montarPlano, relatorio } from "./kit-pessoa-lib.mjs";

const pasta = path.join(path.dirname(fileURLToPath(import.meta.url)), "kit-pessoa-exemplo");
const ler = (nome) => readFileSync(path.join(pasta, `${nome}.csv`), "utf8");

function dadosDoExemplo(trocas = {}) {
  const dados = {};
  for (const [nome, cab] of Object.entries(ARQUIVOS)) dados[nome] = lerCsv(trocas[nome] ?? ler(nome), cab, `${nome}.csv`);
  return dados;
}

describe("leitura do CSV", () => {
  it("aceita aspas, vírgula dentro do campo, BOM e fim de linha do Windows", () => {
    const r = lerCsv('﻿a,b\r\n"x, y","diz ""oi"""\r\n', ["a", "b"]);
    expect(r).toEqual([{ _linha: 2, a: "x, y", b: 'diz "oi"' }]);
  });

  it("recusa cabeçalho diferente, coluna a mais e aspas sem fechar", () => {
    expect(() => lerCsv("a,c\n1,2\n", ["a", "b"], "t.csv")).toThrow(/cabeçalho inesperado/);
    expect(() => lerCsv("a,b\n1,2,3\n", ["a", "b"], "t.csv")).toThrow(/3 colunas/);
    expect(() => lerCsv('a,b\n"1,2\n', ["a", "b"], "t.csv")).toThrow(/aspas/);
  });
});

describe("plano do exemplo", () => {
  const { erros, avisos, plano } = montarPlano(dadosDoExemplo());

  it("não tem erro nem aviso", () => {
    expect(erros).toEqual([]);
    expect(avisos).toEqual([]);
  });

  it("monta listas na ordem do arquivo, com a descrição opcional", () => {
    const recheios = plano.listas.find((l) => l.nome === "Recheios");
    expect(recheios.itens).toEqual([
      { nome: "Ninho com morango", descricao: null, posicao: 1 },
      { nome: "Chocolate", descricao: "acréscimo a combinar no WhatsApp", posicao: 2 },
    ]);
  });

  it("o menor tamanho vira o pedido mínimo e o relatório o mostra", () => {
    expect(menorTamanho(plano.produtos[0])).toBe(10);
    expect(relatorio({ plano, avisos })).toContain("pedido_minimo gravado = 10");
  });
});

describe("erros que impedem a carga", () => {
  const com = (trocas) => montarPlano(dadosDoExemplo(trocas)).erros.join("\n");
  const q = (resto) => `produto,pessoas,grupo,opcao,total,max_sabores,rotulo\n${resto}`;

  it("quantidade para tamanho, grupo ou opção que não existe", () => {
    expect(com({ quantidades: q("Kit Exemplo Basico,15,bolo,,1,,\n") })).toMatch(/tamanho 15/);
    expect(com({ quantidades: q("Kit Exemplo Basico,10,sorvete,,1,,\n") })).toMatch(/grupo "sorvete"/);
    expect(com({ quantidades: q("Kit Exemplo Basico,10,bebida,Cerveja,1,,\n") })).toMatch(/opção "Cerveja"/);
  });

  it("opção em grupo que não é de escolha única, total zero e repetição", () => {
    expect(com({ quantidades: q("Kit Exemplo Basico,10,doces,Brigadeiro,10,,\n") })).toMatch(/só vale em grupo de escolha única/);
    expect(com({ quantidades: q("Kit Exemplo Basico,10,bolo,,0,,\n") })).toMatch(/total inválido/);
    expect(com({ quantidades: q("Kit Exemplo Basico,10,bolo,,1,,\nKit Exemplo Basico,10,bolo,,2,,\n") })).toMatch(/repetida/);
  });

  it("grupo com modo, lista e passo incoerentes", () => {
    const g = (r) => `produto,chave,rotulo,modo,lista,passo\n${r}`;
    expect(com({ grupos: g("Kit Exemplo Basico,x,X,distribuicao,Doces,\n") })).toMatch(/passo de 1 a 100/);
    expect(com({ grupos: g("Kit Exemplo Basico,x,X,escolha_unica,Doces,10\n") })).toMatch(/não tem passo/);
    expect(com({ grupos: g("Kit Exemplo Basico,x,X,fixo,Doces,\n") })).toMatch(/fixo não tem lista/);
    expect(com({ grupos: g("Kit Exemplo Basico,X,X,fixo,,\n") })).toMatch(/chave inválida/);
    expect(com({ grupos: g("Kit Exemplo Basico,x,X,escolha_unica,Inexistente,\n") })).toMatch(/não está em listas/);
  });

  it("tamanho fora do meio quilo, produto sem tamanho e produto desconhecido", () => {
    const t = (r) => `produto,pessoas,bolo_kg,descartaveis\n${r}`;
    expect(com({ tamanhos: t("Kit Exemplo Basico,10,1.3,nao\n") })).toMatch(/meio quilo/);
    expect(com({ tamanhos: t("") })).toMatch(/nenhum tamanho/);
    expect(com({ tamanhos: t("Outro,10,1,nao\n") })).toMatch(/não está em produtos/);
  });

  it("preço, prazo e destaque inválidos; destaque e herança juntos", () => {
    const p = (r) => `produto,subcategoria,preco,prazo_producao_dias,destaque,herda_destaque_de,descricao\n${r}`;
    expect(com({ produtos: p("K,basico,0,5,nao,,\n") })).toMatch(/preço inválido/);
    expect(com({ produtos: p("K,basico,22,x,nao,,\n") })).toMatch(/prazo inválido/);
    expect(com({ produtos: p("K,basico,22,5,talvez,,\n") })).toMatch(/sim" ou "nao/);
    expect(com({ produtos: p("K,basico,22,5,sim,Outro kit,\n") })).toMatch(/OU/);
  });
});

describe("avisos (divergências que o banco não confere)", () => {
  const avisosCom = (trocas) => montarPlano(dadosDoExemplo(trocas)).avisos.join("\n");
  const q = (resto) => `produto,pessoas,grupo,opcao,total,max_sabores,rotulo\n${resto}`;

  it("total de distribuição que não é múltiplo do passo", () => {
    const base = ler("quantidades").replace("Kit Exemplo Basico,10,doces,,20,2,", "Kit Exemplo Basico,10,doces,,25,2,");
    expect(avisosCom({ quantidades: base })).toMatch(/25 não é múltiplo do passo 10/);
  });

  it("grupo sem quantidade para um tamanho e opção sem quantidade", () => {
    const sem = ler("quantidades").replace(/Kit Exemplo Basico,20,bolo,,1,,\n/, "");
    expect(avisosCom({ quantidades: sem })).toMatch(/"bolo" não tem quantidade para 20/);
    const semOpcao = ler("quantidades").replace(/Kit Exemplo Basico,20,bebida,Refrigerante,10,,\n/, "");
    expect(avisosCom({ quantidades: semOpcao })).toMatch(/sem quantidade para Refrigerante/);
    expect(avisosCom({ quantidades: q("") })).toMatch(/não tem quantidade/);
  });
});
