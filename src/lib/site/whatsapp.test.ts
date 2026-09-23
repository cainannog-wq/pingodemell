import { describe, expect, it } from "vitest";
import { WHATSAPP } from "./config";
import { LINK_WHATSAPP_CONTATO, linkWhatsApp } from "./whatsapp";

describe("Link do WhatsApp", () => {
  it("usa o número da configuração única e a mensagem de contato", () => {
    expect(WHATSAPP.numero).toBe("5541988002315");
    expect(WHATSAPP.mensagemContato).toBe("Olá, vim do site da Pingo de Mell e gostaria de fazer um pedido.");
  });

  it("codifica acento, vírgula e espaço corretamente na mensagem de contato", () => {
    expect(LINK_WHATSAPP_CONTATO).toBe(
      "https://wa.me/5541988002315?text=Ol%C3%A1%2C%20vim%20do%20site%20da%20Pingo%20de%20Mell%20e%20gostaria%20de%20fazer%20um%20pedido."
    );
  });

  it("volta exatamente a mesma mensagem ao decodificar (nada se perde no caminho)", () => {
    const url = new URL(LINK_WHATSAPP_CONTATO);
    expect(url.searchParams.get("text")).toBe(WHATSAPP.mensagemContato);
  });

  it("codifica também quebra de linha, & e # (mensagem de pedido futura)", () => {
    const link = linkWhatsApp("Pedido #12\nBolo & doces, ação");
    expect(link).toBe("https://wa.me/5541988002315?text=Pedido%20%2312%0ABolo%20%26%20doces%2C%20a%C3%A7%C3%A3o");
  });
});
