import { WHATSAPP } from "./config";

// Link do wa.me com a mensagem já escrita. encodeURIComponent cobre acento,
// vírgula, espaço e quebra de linha (a mensagem de pedido, no futuro, vai
// ter várias linhas).
export function linkWhatsApp(mensagem: string, numero: string = WHATSAPP.numero): string {
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
}

export const LINK_WHATSAPP_CONTATO = linkWhatsApp(WHATSAPP.mensagemContato);
