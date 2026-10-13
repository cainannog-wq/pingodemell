import { describe, expect, it } from "vitest";
import { lerRecheiosDoEnvio } from "./recheios-servidor";

function form(campos: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}
const GANACHE = { categoria: "Bolos", tipo: "normal" } as const;
const lista = (...nomes: string[]) => JSON.stringify(nomes.map((nome) => ({ nome })));

describe("lerRecheiosDoEnvio (servidor)", () => {
  it("sem o campo no envio: não toca na lista salva", () => {
    expect(lerRecheiosDoEnvio(form({}), GANACHE)).toEqual({ ok: true, aplicar: false });
  });

  it("interruptor ligado com lista boa: aplica na ordem recebida", () => {
    const r = lerRecheiosDoEnvio(form({ recheios_ligados: "1", recheios_produto: lista("Dois amores", "Ouro branco") }), GANACHE);
    expect(r).toEqual({ ok: true, aplicar: true, lista: [{ nome: "Dois amores" }, { nome: "Ouro branco" }] });
  });

  it("interruptor ligado com lista vazia é recusado", () => {
    const r = lerRecheiosDoEnvio(form({ recheios_ligados: "1", recheios_produto: "[]" }), GANACHE);
    expect(r.ok).toBe(false);
  });

  it("recheio repetido ou em branco é recusado", () => {
    expect(lerRecheiosDoEnvio(form({ recheios_ligados: "1", recheios_produto: lista("Ninho", "ninho") }), GANACHE).ok).toBe(false);
    expect(lerRecheiosDoEnvio(form({ recheios_ligados: "1", recheios_produto: lista("Ninho", " ") }), GANACHE).ok).toBe(false);
  });

  it("interruptor desligado apaga a lista (aplica vazia), mesmo que mandem nomes", () => {
    const r = lerRecheiosDoEnvio(form({ recheios_ligados: "0", recheios_produto: lista("Ninho") }), GANACHE);
    expect(r).toEqual({ ok: true, aplicar: true, lista: [] });
  });

  it("Bolo tradicional e outras categorias não aceitam lista (nem à força); só aceitam limpar", () => {
    const comLista = { recheios_ligados: "1", recheios_produto: lista("Ninho") };
    expect(lerRecheiosDoEnvio(form(comLista), { categoria: "Bolos", tipo: "bolo" }).ok).toBe(false);
    expect(lerRecheiosDoEnvio(form(comLista), { categoria: "Doces", tipo: "normal" }).ok).toBe(false);
    expect(lerRecheiosDoEnvio(form({ recheios_ligados: "0", recheios_produto: "[]" }), { categoria: "Doces", tipo: "normal" })).toEqual({
      ok: true,
      aplicar: true,
      lista: [],
    });
  });

  it("Bento Cake aceita; id que não é uuid e JSON quebrado são recusados", () => {
    expect(lerRecheiosDoEnvio(form({ recheios_ligados: "1", recheios_produto: lista("Ninho") }), { categoria: "Bento Cake", tipo: "bento_cake" }).ok).toBe(true);
    expect(lerRecheiosDoEnvio(form({ recheios_ligados: "1", recheios_produto: JSON.stringify([{ id: "x", nome: "A" }]) }), GANACHE).ok).toBe(false);
    expect(lerRecheiosDoEnvio(form({ recheios_ligados: "1", recheios_produto: "{" }), GANACHE).ok).toBe(false);
    expect(lerRecheiosDoEnvio(form({ recheios_ligados: "1", recheios_produto: "{}" }), GANACHE).ok).toBe(false);
  });
});
