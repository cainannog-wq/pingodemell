import { describe, expect, it } from "vitest";
import {
  camposComErro,
  emailValido,
  enderecoCompleto,
  mascararWhatsApp,
  MENSAGENS,
  nomeCompleto,
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
  aceite: true,
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
      nome: MENSAGENS.nomeVazio,
      whatsapp: MENSAGENS.whatsappVazio,
      aceite: MENSAGENS.aceite,
      data: MENSAGENS.dataVazia,
      hora: MENSAGENS.horaSemData,
      modo: MENSAGENS.modo,
      pagamento: MENSAGENS.pagamento,
    });
    expect(camposComErro(erros)).toEqual(["nome", "whatsapp", "aceite", "data", "hora", "modo", "pagamento"]);
  });

  it.each([
    ["nome", { nome: "   " }, MENSAGENS.nomeVazio],
    ["nome", { nome: "Juliana" }, MENSAGENS.nomeIncompleto],
    ["nome", { nome: "  Juliana   " }, MENSAGENS.nomeIncompleto],
    ["whatsapp", { whatsapp: "" }, MENSAGENS.whatsappVazio],
    ["whatsapp", { whatsapp: "(41) 9971" }, MENSAGENS.whatsappInvalido],
    ["aceite", { aceite: false }, MENSAGENS.aceite],
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

  it("nome completo: pelo menos nome e sobrenome", () => {
    expect(nomeCompleto("Juliana Ribeiro")).toBe(true);
    expect(nomeCompleto("Ana Maria de Souza")).toBe(true);
    expect(nomeCompleto("Juliana")).toBe(false);
    expect(nomeCompleto("   ")).toBe(false);
  });

  it("e-mail é opcional; preenchido, precisa estar no formato", () => {
    expect(validarCheckout({ ...valido, email: "" }, HOJE, SEM_DIAS_OFF).email).toBeUndefined();
    expect(validarCheckout({ ...valido, email: "juliana@" }, HOJE, SEM_DIAS_OFF).email).toBe(MENSAGENS.email);
    expect(validarCheckout({ ...valido, email: "juliana@email.com" }, HOJE, SEM_DIAS_OFF).email).toBeUndefined();
  });

  it("endereço só é exigido na entrega: cidade, bairro, rua e número obrigatórios; complemento opcional", () => {
    expect(validarCheckout({ ...valido, modo: "retirada" }, HOJE, SEM_DIAS_OFF).cidade).toBeUndefined();
    const entrega = validarCheckout({ ...valido, modo: "entrega" }, HOJE, SEM_DIAS_OFF);
    expect(entrega.cidade).toBe(MENSAGENS.cidade);
    expect(entrega.bairro).toBe(MENSAGENS.bairro);
    expect(entrega.rua).toBe(MENSAGENS.rua);
    expect(entrega.numero).toBe(MENSAGENS.numero);
    expect(entrega.complemento).toBeUndefined();
    expect(camposComErro(entrega)).toEqual(["cidade", "bairro", "rua", "numero"]);
    expect(
      validarCheckout(
        { ...valido, modo: "entrega", cidade: "Mandirituba", bairro: "Centro", rua: "Rua X", numero: "412" },
        HOJE,
        SEM_DIAS_OFF
      )
    ).toEqual({});
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

  it("endereço em um texto só, com bairro e cidade", () => {
    expect(
      enderecoCompleto({ rua: " Rua das Acácias ", numero: "412", complemento: "", bairro: "Nações", cidade: "Fazenda Rio Grande" })
    ).toBe("Rua das Acácias, 412, Nações, Fazenda Rio Grande");
    expect(enderecoCompleto({ rua: "Rua X", numero: "s/n", complemento: "Casa 2", bairro: "Centro", cidade: "Mandirituba" })).toBe(
      "Rua X, s/n - Casa 2, Centro, Mandirituba"
    );
  });
});
