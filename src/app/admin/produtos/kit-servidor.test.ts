import { describe, expect, it, vi } from "vitest";
import {
  ERRO_KIT_COM_COMPOSICAO,
  ERRO_KIT_LEITURA,
  ERRO_KIT_SO_POR_CARGA,
  recusarTrocaDeTipo,
} from "./kit-servidor";

// O Salvar do produto nunca cria um kit nem tira o tipo de um kit com
// composição. O banco é simulado: só se prova quando o servidor consulta
// kit_grupos e o que ele recusa.

function banco(resposta: { count: number | null; error: { message: string } | null }) {
  const consultas: string[] = [];
  const cliente = {
    from: (tabela: string) => {
      consultas.push(tabela);
      return { select: () => ({ eq: vi.fn(async () => resposta) }) };
    },
  };
  return { cliente: cliente as never, consultas };
}

describe("recusarTrocaDeTipo", () => {
  it("criar kit pelo formulário ou virar kit na edição é recusado, sem consultar o banco", async () => {
    const { cliente, consultas } = banco({ count: 0, error: null });
    expect(await recusarTrocaDeTipo(cliente, "p", null, "kit_pessoa")).toBe(ERRO_KIT_SO_POR_CARGA);
    expect(await recusarTrocaDeTipo(cliente, "p", "normal", "kit_pessoa")).toBe(ERRO_KIT_SO_POR_CARGA);
    expect(consultas).toEqual([]);
  });

  it("kit que continua kit e produto que não é kit passam sem consulta", async () => {
    const { cliente, consultas } = banco({ count: 5, error: null });
    expect(await recusarTrocaDeTipo(cliente, "p", "kit_pessoa", "kit_pessoa")).toBeNull();
    expect(await recusarTrocaDeTipo(cliente, "p", "normal", "cento")).toBeNull();
    expect(await recusarTrocaDeTipo(cliente, "p", undefined, "normal")).toBeNull();
    expect(consultas).toEqual([]);
  });

  it("kit com composição não muda de tipo; sem composição muda; falha de leitura recusa", async () => {
    const com = banco({ count: 3, error: null });
    expect(await recusarTrocaDeTipo(com.cliente, "p", "kit_pessoa", "normal")).toBe(ERRO_KIT_COM_COMPOSICAO);
    expect(com.consultas).toEqual(["kit_grupos"]);
    expect(await recusarTrocaDeTipo(banco({ count: 0, error: null }).cliente, "p", "kit_pessoa", "normal")).toBeNull();
    expect(await recusarTrocaDeTipo(banco({ count: null, error: { message: "x" } }).cliente, "p", "kit_pessoa", "normal")).toBe(
      ERRO_KIT_LEITURA
    );
  });
});
