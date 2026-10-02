import { describe, expect, it } from "vitest";
import { LOJA, WHATSAPP, urlInstagram } from "./config";
import { LINK_WHATSAPP_SEM_MENSAGEM } from "./whatsapp";

// Dados da loja que aparecem em mais de um formato: as cópias não podem
// divergir.
describe("LOJA", () => {
  it("horarioAtendimento contém o texto de diaFechado", () => {
    expect(LOJA.horarioAtendimento).toContain(LOJA.diaFechado);
  });

  it("horarioAtendimento começa pelo horario", () => {
    expect(LOJA.horarioAtendimento.startsWith(LOJA.horario)).toBe(true);
  });

  it("endereco é enderecoCurto mais a cidade", () => {
    expect(LOJA.endereco).toBe(`${LOJA.enderecoCurto}, ${LOJA.cidade.replace(", ", "/")}`);
  });

  it("o Instagram sai do @ de LOJA", () => {
    expect(urlInstagram()).toBe("https://www.instagram.com/pingodemell.frg");
    expect(urlInstagram("@outra.loja")).toBe("https://www.instagram.com/outra.loja");
  });

  it("o WhatsApp sem mensagem usa os dígitos do telefone de LOJA, igual ao número do botão flutuante", () => {
    expect(LINK_WHATSAPP_SEM_MENSAGEM).toBe("https://wa.me/5541988002315");
    expect(LINK_WHATSAPP_SEM_MENSAGEM).toBe(`https://wa.me/${WHATSAPP.numero}`);
  });
});
