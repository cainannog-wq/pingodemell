import { describe, expect, it } from "vitest";
import { VAZIO, type DadosCheckout } from "./formulario";
import { escreverRascunho, lerRascunho } from "./rascunho";

const cheio: DadosCheckout = {
  nome: "Juliana",
  whatsapp: "(41) 99712-4408",
  email: "ju@email.com",
  data: "2026-10-03",
  hora: "14:00",
  modo: "entrega",
  rua: "Rua X, Nações",
  numero: "412",
  complemento: "Casa",
  ocasiao: "Aniversário",
  pagamento: "credito",
  observacoes: "Sem glúten",
};

describe("rascunho do checkout (sessionStorage)", () => {
  it("volta igual ao que foi escrito", () => {
    expect(lerRascunho(escreverRascunho(cheio))).toEqual(cheio);
  });

  it("vazio, JSON quebrado ou versão desconhecida volta vazio", () => {
    expect(lerRascunho(null)).toEqual(VAZIO);
    expect(lerRascunho("{")).toEqual(VAZIO);
    expect(lerRascunho(JSON.stringify({ versao: 2, dados: cheio }))).toEqual(VAZIO);
  });

  it("campo de tipo errado, fora do formato ou grande demais volta vazio", () => {
    const lido = lerRascunho(
      JSON.stringify({
        versao: 1,
        dados: { ...cheio, nome: 42, data: "amanhã", hora: "2pm", modo: "drone", pagamento: "boleto", observacoes: "x".repeat(501) },
      })
    );
    expect(lido).toEqual({ ...cheio, nome: "", data: "", hora: "", modo: "", pagamento: "", observacoes: "" });
  });
});
