import { describe, expect, it } from "vitest";
import {
  camposComErro,
  emailValido,
  enderecoCompleto,
  mascararWhatsApp,
  MENSAGENS,
  validarCheckout,
  VAZIO,
  whatsAppValido,
  type DadosCheckout,
} from "./formulario";

const HOJE = "2026-09-29"; // terça
const SEM_DIAS_OFF = new Set<string>();

const valido: DadosCheckout = {
  ...VAZIO,
  nome: "Juliana Ribeiro",
  whatsapp: "(41) 99712-4408",
  data: "2026-10-03",
  hora: "14:00",
  modo: "retirada",
  pagamento: "pix",
};

describe("validação do formulário do checkout", () => {
  it("formulário completo não tem erro", () => {
    expect(validarCheckout(valido, HOJE, SEM_DIAS_OFF)).toEqual({});
  });

  it("formulário vazio: cada campo obrigatório aponta o seu erro, na ordem da tela", () => {
    const erros = validarCheckout(VAZIO, HOJE, SEM_DIAS_OFF);
    expect(erros).toEqual({
      nome: MENSAGENS.nome,
      whatsapp: MENSAGENS.whatsappVazio,
      data: MENSAGENS.dataVazia,
      hora: MENSAGENS.horaSemData,
      modo: MENSAGENS.modo,
      pagamento: MENSAGENS.pagamento,
    });
    expect(camposComErro(erros)).toEqual(["nome", "whatsapp", "data", "hora", "modo", "pagamento"]);
  });

  it.each([
    ["nome", { nome: "   " }, MENSAGENS.nome],
    ["whatsapp", { whatsapp: "" }, MENSAGENS.whatsappVazio],
    ["whatsapp", { whatsapp: "(41) 9971" }, MENSAGENS.whatsappInvalido],
    ["data", { data: "", hora: "" }, MENSAGENS.dataVazia],
    ["data", { data: "2026-10-05", hora: "" }, MENSAGENS.dataBloqueada], // segunda
    ["hora", { hora: "" }, MENSAGENS.horaVazia],
    ["hora", { hora: "18:00" }, MENSAGENS.horaInvalida],
    ["modo", { modo: "" }, MENSAGENS.modo],
    ["pagamento", { pagamento: "" }, MENSAGENS.pagamento],
  ] as const)("campo %s: %j -> erro", (campo, mudanca, mensagem) => {
    const erros = validarCheckout({ ...valido, ...mudanca } as DadosCheckout, HOJE, SEM_DIAS_OFF);
    expect(erros[campo]).toBe(mensagem);
  });

  it("e-mail é opcional; preenchido, precisa estar no formato", () => {
    expect(validarCheckout({ ...valido, email: "" }, HOJE, SEM_DIAS_OFF).email).toBeUndefined();
    expect(validarCheckout({ ...valido, email: "juliana@" }, HOJE, SEM_DIAS_OFF).email).toBe(MENSAGENS.email);
    expect(validarCheckout({ ...valido, email: "juliana@email.com" }, HOJE, SEM_DIAS_OFF).email).toBeUndefined();
  });

  it("endereço só é exigido na entrega: rua e número obrigatórios, complemento opcional", () => {
    expect(validarCheckout({ ...valido, modo: "retirada" }, HOJE, SEM_DIAS_OFF).rua).toBeUndefined();
    const entrega = validarCheckout({ ...valido, modo: "entrega" }, HOJE, SEM_DIAS_OFF);
    expect(entrega.rua).toBe(MENSAGENS.rua);
    expect(entrega.numero).toBe(MENSAGENS.numero);
    expect(entrega.complemento).toBeUndefined();
    expect(validarCheckout({ ...valido, modo: "entrega", rua: "Rua X, Nações", numero: "412" }, HOJE, SEM_DIAS_OFF)).toEqual({});
  });

  it("formas de pagamento aceitas: Pix, crédito e débito", () => {
    for (const pagamento of ["pix", "credito", "debito"] as const) {
      expect(validarCheckout({ ...valido, pagamento }, HOJE, SEM_DIAS_OFF).pagamento).toBeUndefined();
    }
    expect(validarCheckout({ ...valido, pagamento: "boleto" as never }, HOJE, SEM_DIAS_OFF).pagamento).toBe(MENSAGENS.pagamento);
  });

  it("data em dia sem produção é recusada", () => {
    expect(validarCheckout({ ...valido }, HOJE, new Set(["2026-10-03"])).data).toBe(MENSAGENS.dataBloqueada);
  });
});

describe("WhatsApp", () => {
  it("máscara enquanto digita", () => {
    expect(mascararWhatsApp("4")).toBe("(4");
    expect(mascararWhatsApp("41997")).toBe("(41) 997");
    expect(mascararWhatsApp("41997124408")).toBe("(41) 99712-4408");
    expect(mascararWhatsApp("4133334444")).toBe("(41) 3333-4444");
    expect(mascararWhatsApp("41 99712-4408 999")).toBe("(41) 99712-4408");
  });

  it("aceita celular (11 dígitos começando em 9) e fixo (10 dígitos)", () => {
    expect(whatsAppValido("(41) 99712-4408")).toBe(true);
    expect(whatsAppValido("(41) 3333-4444")).toBe(true);
    expect(whatsAppValido("(41) 89712-4408")).toBe(false);
    expect(whatsAppValido("(01) 99712-4408")).toBe(false);
    expect(whatsAppValido("99712-4408")).toBe(false);
  });
});

describe("e-mail e endereço", () => {
  it("formato do e-mail", () => {
    expect(emailValido("a@b.com")).toBe(true);
    expect(emailValido("a@b")).toBe(false);
    expect(emailValido("a b@c.com")).toBe(false);
  });

  it("endereço em um texto só", () => {
    expect(enderecoCompleto({ rua: " Rua das Acácias, Nações ", numero: "412", complemento: "" })).toBe("Rua das Acácias, Nações, 412");
    expect(enderecoCompleto({ rua: "Rua X", numero: "s/n", complemento: "Casa 2" })).toBe("Rua X, s/n - Casa 2");
  });
});
