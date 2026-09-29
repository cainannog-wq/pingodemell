import { describe, expect, it } from "vitest";
import { comPrecoAPartirDe, semIndisponiveis, type RecheioVitrine } from "./disponibilidade";
import type { ProdutoVitrine } from "./mais-pedidos";

function p(nome: string, parcial: Partial<ProdutoVitrine>): ProdutoVitrine {
  return {
    id: nome,
    slug: nome,
    nome,
    descricao: null,
    preco: 10,
    image_url: null,
    Categoria: "Doces",
    tipo: "normal",
    unidade_venda: null,
    pedido_minimo: 1,
    step_quantidade: "livre",
    ativo: true,
    destaque: false,
    atualizado_em: "2026-09-23T14:29:18.070Z",
    ...parcial,
  };
}

const BOLO = p("Bolo", { tipo: "bolo", Categoria: "Bolos", preco: 0 });
const SMASH = p("Smash", { Categoria: "Bolos" });
const BENTO = p("Bento", { tipo: "bento_cake", Categoria: "Bento Cake" });
const CENTO = p("Cento", { tipo: "cento" });
const DOCE = p("Doce", {});
const TODOS = [BOLO, SMASH, BENTO, CENTO, DOCE];

const REC_BOLO: RecheioVitrine = { id: "1", nome: "A", vale_bolo: true, vale_bento: false, preco_kg: 80, grupo: "frutas", ativo: true };
const REC_BENTO: RecheioVitrine = { id: "2", nome: "B", vale_bolo: false, vale_bento: true, preco_kg: null, grupo: null, ativo: true };

const nomes = (l: ProdutoVitrine[]) => l.map((x) => x.nome);
const COM_SABOR = new Set(["Cento"]);

describe("disponibilidade — Bolo e Bento Cake esvaziam separados", () => {
  it("com os dois catálogos: tudo aparece", () => {
    expect(nomes(semIndisponiveis(TODOS, COM_SABOR, [REC_BOLO, REC_BENTO]))).toEqual(["Bolo", "Smash", "Bento", "Cento", "Doce"]);
  });

  it("sem recheio de Bento: some só o Bento", () => {
    expect(nomes(semIndisponiveis(TODOS, COM_SABOR, [REC_BOLO]))).toEqual(["Bolo", "Smash", "Cento", "Doce"]);
  });

  it("sem recheio de Bolo: some só o Bolo (o Smash Cake continua)", () => {
    expect(nomes(semIndisponiveis(TODOS, COM_SABOR, [REC_BENTO]))).toEqual(["Smash", "Bento", "Cento", "Doce"]);
  });

  it("recheio inativo (visto pelo admin logado) não conta", () => {
    expect(nomes(semIndisponiveis(TODOS, COM_SABOR, [{ ...REC_BOLO, ativo: false }, { ...REC_BENTO, ativo: false }]))).toEqual([
      "Smash",
      "Cento",
      "Doce",
    ]);
  });

  it("a regra do Cento sem sabor continua valendo junto", () => {
    expect(nomes(semIndisponiveis(TODOS, new Set(), [REC_BOLO, REC_BENTO]))).not.toContain("Cento");
  });

  it("'a partir de' entra só no Bolo, com o menor R$/kg ativo", () => {
    const r = comPrecoAPartirDe(TODOS, [REC_BOLO, { ...REC_BOLO, id: "3", preco_kg: 60 }, { ...REC_BOLO, id: "4", preco_kg: 10, ativo: false }]);
    expect(r.find((x) => x.nome === "Bolo")?.preco_a_partir_de).toBe(60);
    expect(r.filter((x) => x.nome !== "Bolo").every((x) => !("preco_a_partir_de" in x))).toBe(true);
  });
});
