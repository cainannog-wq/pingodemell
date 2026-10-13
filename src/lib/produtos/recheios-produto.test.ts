import { describe, expect, it } from "vitest";
import { aceitaRecheiosPersonalizados, chaveDoRecheio, validarRecheiosDoProduto } from "./recheios-produto";

describe("aceitaRecheiosPersonalizados — onde o interruptor existe", () => {
  it("Bolos de tipo normal (Ganache, Kit Kat, Smash Cake) e Bento Cake", () => {
    expect(aceitaRecheiosPersonalizados({ Categoria: "Bolos", tipo: "normal" })).toBe(true);
    expect(aceitaRecheiosPersonalizados({ Categoria: "Bento Cake", tipo: "bento_cake" })).toBe(true);
  });

  it("nunca no Bolo tradicional (tipo bolo)", () => {
    expect(aceitaRecheiosPersonalizados({ Categoria: "Bolos", tipo: "bolo" })).toBe(false);
  });

  it.each(["Doces", "Salgados", "Bebidas", "Kit Festa", "Adicionais"] as const)("nunca na categoria %s", (categoria) => {
    expect(aceitaRecheiosPersonalizados({ Categoria: categoria, tipo: "normal" })).toBe(false);
    expect(aceitaRecheiosPersonalizados({ Categoria: categoria, tipo: "cento" })).toBe(false);
  });

  it("sem categoria ou com tipo que não combina com a categoria: não", () => {
    expect(aceitaRecheiosPersonalizados({ Categoria: null, tipo: "normal" })).toBe(false);
    expect(aceitaRecheiosPersonalizados({ Categoria: "Bolos", tipo: "cento" })).toBe(false);
    expect(aceitaRecheiosPersonalizados({ Categoria: "Bento Cake", tipo: "normal" })).toBe(false);
  });
});

describe("validarRecheiosDoProduto — o que bloqueia o Salvar", () => {
  it("lista vazia bloqueia", () => {
    const r = validarRecheiosDoProduto([]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toMatch(/pelo menos um recheio/);
  });

  it("campo em branco (ou só espaços) bloqueia", () => {
    expect(validarRecheiosDoProduto([{ nome: "Brigadeiro" }, { nome: "   " }]).ok).toBe(false);
  });

  it("recheio repetido bloqueia, sem diferenciar maiúscula, acento nem espaço sobrando", () => {
    expect(validarRecheiosDoProduto([{ nome: "Prestígio" }, { nome: "prestigio" }]).ok).toBe(false);
    expect(validarRecheiosDoProduto([{ nome: "Dois amores" }, { nome: "  DOIS   Amores " }]).ok).toBe(false);
    const r = validarRecheiosDoProduto([{ nome: "Ninho" }, { nome: "ninho" }]);
    if (!r.ok) expect(r.erro).toMatch(/repetido/);
  });

  it("nome grande demais bloqueia", () => {
    expect(validarRecheiosDoProduto([{ nome: "x".repeat(101) }]).ok).toBe(false);
  });

  it("lista boa passa na ordem recebida, com nomes limpos e ids mantidos", () => {
    const r = validarRecheiosDoProduto([{ nome: "  Dois   amores " }, { id: "11111111-1111-4111-8111-111111111111", nome: "Ouro branco" }]);
    expect(r).toEqual({ ok: true, recheios: [{ nome: "Dois amores" }, { id: "11111111-1111-4111-8111-111111111111", nome: "Ouro branco" }] });
  });

  it("a chave de comparação ignora acento, maiúscula e espaços", () => {
    expect(chaveDoRecheio("  Pêssego  com DOCE de leite")).toBe("pessego com doce de leite");
  });
});
