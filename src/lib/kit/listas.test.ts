import { describe, expect, it } from "vitest";
import {
  DESCRICAO_ITEM_MAX,
  NOME_ITEM_MAX,
  ordenarItens,
  parseDescricaoItem,
  parseNomeItem,
  planejarMovimento,
  proximaPosicao,
  traduzirErroKit,
  type ItemDaLista,
} from "./listas";

const LISTA = "11111111-0000-4000-8000-000000000001";
const item = (id: string, nome: string, posicao: number): ItemDaLista => ({
  id,
  lista_id: LISTA,
  nome,
  descricao: null,
  posicao,
  ativo: true,
});

describe("nome e descrição", () => {
  it("nome: tira espaço das pontas, junta os repetidos e recusa vazio e longo", () => {
    expect(parseNomeItem("  Ninho   com morango ")).toEqual({ success: true, data: "Ninho com morango" });
    expect(parseNomeItem("   ").success).toBe(false);
    expect(parseNomeItem("a".repeat(NOME_ITEM_MAX)).success).toBe(true);
    expect(parseNomeItem("a".repeat(NOME_ITEM_MAX + 1)).success).toBe(false);
  });

  it("descrição: vazia vira nula, longa é recusada", () => {
    expect(parseDescricaoItem("  ")).toEqual({ success: true, data: null });
    expect(parseDescricaoItem(" acréscimo   a combinar ")).toEqual({ success: true, data: "acréscimo a combinar" });
    expect(parseDescricaoItem("a".repeat(DESCRICAO_ITEM_MAX + 1)).success).toBe(false);
  });
});

describe("posição e movimento", () => {
  it("ordena por posição e desempata pelo nome", () => {
    const fila = ordenarItens([item("c", "C", 3), item("b2", "B", 2), item("b1", "A", 2)]);
    expect(fila.map((i) => i.id)).toEqual(["b1", "b2", "c"]);
  });

  it("próxima posição é o fim da lista; lista cheia devolve null", () => {
    expect(proximaPosicao([])).toBe(1);
    expect(proximaPosicao([{ posicao: 1 }, { posicao: 4 }])).toBe(5);
    expect(proximaPosicao([{ posicao: 200 }])).toBeNull();
  });

  it("trocar dois vizinhos grava só os dois", () => {
    const itens = [item("a", "A", 1), item("b", "B", 2), item("c", "C", 3)];
    expect(planejarMovimento(itens, "b", "subir")).toEqual([
      { id: "b", lista_id: LISTA, nome: "B", posicao: 1 },
      { id: "a", lista_id: LISTA, nome: "A", posicao: 2 },
    ]);
  });

  it("primeiro subindo, último descendo e id desconhecido: nada a gravar", () => {
    const itens = [item("a", "A", 1), item("b", "B", 2)];
    expect(planejarMovimento(itens, "a", "subir")).toBeNull();
    expect(planejarMovimento(itens, "b", "descer")).toBeNull();
    expect(planejarMovimento(itens, "x", "subir")).toBeNull();
  });

  it("posições tortas (buraco e empate) saem renumeradas de 1 em 1", () => {
    const itens = [item("a", "A", 3), item("b", "B", 3), item("c", "C", 9)];
    const mudancas = planejarMovimento(itens, "c", "subir") ?? [];
    const posicoes = new Map(itens.map((i) => [i.id, i.posicao]));
    for (const m of mudancas) posicoes.set(m.id, m.posicao);
    expect([...posicoes.values()].sort()).toEqual([1, 2, 3]);
    expect(posicoes.get("c")).toBe(2);
  });
});

describe("erros", () => {
  it("nenhuma mensagem crua do banco chega à tela", () => {
    expect(traduzirErroKit({ code: "23505" })).toMatch(/nome nesta lista/);
    expect(traduzirErroKit({ code: "23514" })).toMatch(/100 caracteres/);
    expect(traduzirErroKit({ code: "XX000" })).toMatch(/Tente de novo/);
  });
});
