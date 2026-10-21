import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ARQUIVOS, lerCsv, montarPlano } from "./kit-pessoa-lib.mjs";

// A carga REAL dos kits (scripts/carga/kit-pessoa-real, gerada por gerar.mjs a
// partir das regras do Cainan de 21/10/2026): sem erro nem aviso, com os 31
// tamanhos e os preços de src/lib/kit/tamanhos-31.json e as quantidades que ele
// ditou. O ensaio contra o banco é o do script de carga.

const aqui = path.dirname(fileURLToPath(import.meta.url));
const ler = (nome) => lerCsv(readFileSync(path.join(aqui, "kit-pessoa-real", `${nome}.csv`), "utf8"), ARQUIVOS[nome], `${nome}.csv`);
const dados = Object.fromEntries(Object.keys(ARQUIVOS).map((n) => [n, ler(n)]));
const { erros, avisos, plano } = montarPlano(dados);
const tamanhos31 = JSON.parse(readFileSync(path.join(aqui, "..", "..", "src", "lib", "kit", "tamanhos-31.json"), "utf8"));
const kit = (nome) => plano.produtos.find((p) => p.nome === nome);
const qtd = (nome, pessoas, grupo, opcao = null) => kit(nome).quantidades.find((q) => q.pessoas === pessoas && q.grupo === grupo && q.opcao === opcao);

describe("carga real dos kits", () => {
  it("não tem erro nem aviso (todo total de distribuição é múltiplo de 10, todo grupo tem quantidade em todo tamanho)", () => {
    expect(erros).toEqual([]);
    expect(avisos).toEqual([]);
  });

  it("os 31 tamanhos e os preços por pessoa são os do kit antigo", () => {
    expect(plano.produtos).toHaveLength(3);
    for (const antigo of tamanhos31.kits) {
      const novo = kit(antigo.nome);
      expect(novo.preco * 100, antigo.nome).toBe(antigo.precoPorPessoaCentavos);
      expect(novo.tamanhos.map((t) => t.pessoas).sort((a, b) => a - b)).toEqual(antigo.tamanhos.map(([p]) => p));
    }
  });

  it("listas: 12 recheios (o último com a descrição do acréscimo), 6 fritos, 8 assados, 6 doces de 8g, 9 de 15g, 4 sanduíches", () => {
    const n = (nome) => plano.listas.find((l) => l.nome === nome).itens;
    expect([n("Recheios do bolo").length, n("Fritos").length, n("Assados").length, n("Doces 8g").length, n("Doces 15g").length, n("Sanduíches").length]).toEqual([12, 6, 8, 6, 9, 4]);
    expect(n("Recheios do bolo").at(-1)).toMatchObject({ nome: "Recheios com chocolate", descricao: "acréscimo a combinar no WhatsApp" });
    expect(n("Recheios do bolo").filter((i) => i.descricao)).toHaveLength(1);
  });

  it("as três quantidades arredondadas para baixo e o limite de sabores só em assados e sanduíches", () => {
    expect(qtd("Kit Festa Básico", 15, "fritos").total).toBe(170);
    expect(qtd("Kit Festa Clássico", 15, "assados")).toMatchObject({ total: 70, maxSabores: 2 });
    expect(qtd("Kit Festa Premium", 15, "assados")).toMatchObject({ total: 60, maxSabores: 2 });
    for (const p of plano.produtos) {
      for (const q of p.quantidades) {
        if (q.maxSabores !== null) expect(["assados", "sanduiches"]).toContain(q.grupo);
      }
    }
  });

  it("bebida: Básico escolhe Cini ou Coca (quantidade e rótulo por tamanho); Clássico e Premium só Coca 2L, fixa", () => {
    expect(qtd("Kit Festa Básico", 10, "bebida", "Cini")).toMatchObject({ total: 2, rotulo: "2 Cini 2L" });
    expect(qtd("Kit Festa Básico", 10, "bebida", "Coca")).toMatchObject({ total: 1, rotulo: "1 Coca 1L" });
    expect(qtd("Kit Festa Básico", 90, "bebida", "Cini").total).toBe(15);
    expect(qtd("Kit Festa Básico", 90, "bebida", "Coca").total).toBe(7);
    expect(kit("Kit Festa Clássico").grupos.find((g) => g.chave === "bebida")).toMatchObject({ modo: "fixo", lista: null });
    expect(qtd("Kit Festa Premium", 100, "bebida")).toMatchObject({ total: 10, rotulo: "Coca 2L" });
  });

  it("bolo em meio quilo e descartáveis só de 20 pessoas em diante", () => {
    const b = kit("Kit Festa Básico");
    expect(b.tamanhos.find((t) => t.pessoas === 15)).toMatchObject({ boloKg: 1.5, descartaveis: false });
    expect(b.tamanhos.find((t) => t.pessoas === 10)).toMatchObject({ boloKg: 1, descartaveis: false });
    expect(b.tamanhos.find((t) => t.pessoas === 20)).toMatchObject({ boloKg: 2, descartaveis: true });
    expect(b.tamanhos.find((t) => t.pessoas === 100)).toMatchObject({ boloKg: 10, descartaveis: true });
  });

  it("Básico herda o destaque do kit antigo de 10 pessoas; os outros dois não são destaque", () => {
    expect(kit("Kit Festa Básico")).toMatchObject({ herdaDestaqueDe: "Kit Festa Básico 10 pessoas", destaque: false });
    expect(kit("Kit Festa Clássico")).toMatchObject({ herdaDestaqueDe: null, destaque: false });
    expect(kit("Kit Festa Premium")).toMatchObject({ herdaDestaqueDe: null, destaque: false });
  });

  it("texto voltado à cliente sem hífen nem emoji (nomes de listas, opções, rótulos e descrições)", () => {
    const textos = [
      ...plano.listas.flatMap((l) => [l.nome, ...l.itens.flatMap((i) => [i.nome, i.descricao ?? ""])]),
      ...plano.produtos.flatMap((p) => [p.nome, p.descricao, ...p.grupos.map((g) => g.rotulo), ...p.quantidades.map((q) => q.rotulo ?? "")]),
    ];
    for (const t of textos) expect(t, t).not.toMatch(/[-‐-―\u{1F300}-\u{1FAFF}]/u);
  });
});
