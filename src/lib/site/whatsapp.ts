import { LOJA, WHATSAPP } from "./config";

// Link do wa.me com a mensagem já escrita. encodeURIComponent cobre acento,
// vírgula, espaço e quebra de linha (a mensagem de pedido, no futuro, vai
// ter várias linhas).
export function linkWhatsApp(mensagem: string, numero: string = WHATSAPP.numero): string {
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
}

export const LINK_WHATSAPP_CONTATO = linkWhatsApp(WHATSAPP.mensagemContato);

// Conversa sem mensagem preenchida (telefone da Quem Somos). O número sai
// do telefone de LOJA, só os dígitos, com o DDI 55 na frente.
export const LINK_WHATSAPP_SEM_MENSAGEM = `https://wa.me/55${LOJA.telefone.replace(/\D/g, "")}`;
