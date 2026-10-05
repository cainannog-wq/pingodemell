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

// Conversa sem mensagem, pelo número do WHATSAPP (canal do titular na
// Política e confirmação sem retrato).
export const LINK_WHATSAPP_GERAL = `https://wa.me/${WHATSAPP.numero}`;

// ---------- Origem do clique (PR 2 da Fase 4) ----------
//
// Todo link wa.me do site público passa por atributosWhatsApp, que exige a
// origem de uma lista fechada. O clique vira o evento whatsapp_clique do
// GA4 só com essa origem (src/components/site/analitica/Analitica.tsx lê o
// atributo data-whatsapp-origem); nunca a URL, a mensagem nem o texto do
// link. src/lib/site/whatsapp-origem.test.ts varre o código e falha com
// link wa.me fora deste caminho. O admin fica de fora (sem GA4).

export const ORIGENS_WHATSAPP = [
  "flutuante",
  "menu",
  "home",
  "quem_somos",
  "politica",
  "carrinho_vazio",
  "checkout_falha",
  "confirmacao",
  "confirmacao_sem_retrato",
  "saida_sem_registro",
] as const;

export type OrigemWhatsApp = (typeof ORIGENS_WHATSAPP)[number];

export type AtributosWhatsApp = {
  href: string;
  target: "_blank";
  rel: "noopener noreferrer";
  "data-whatsapp-origem": OrigemWhatsApp;
};

export function ehOrigemWhatsApp(valor: unknown): valor is OrigemWhatsApp {
  return typeof valor === "string" && (ORIGENS_WHATSAPP as readonly string[]).includes(valor);
}

// Atributos do link: nova aba, como sempre, e a origem do clique.
export function atributosWhatsApp(origem: OrigemWhatsApp, href: string): AtributosWhatsApp {
  return { href, target: "_blank", rel: "noopener noreferrer", "data-whatsapp-origem": origem };
}
