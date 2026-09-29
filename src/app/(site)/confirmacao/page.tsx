import type { Metadata } from "next";
import { Confirmacao } from "./_confirmacao/Confirmacao";
import "./confirmacao.css";

// Confirmação (página 6 do site, PR confirmacao-e-gravacao). Não busca nada
// no banco: tudo vem do retrato do pedido enviado, guardado na aba
// (sessionStorage, src/lib/pedidos/retrato.ts). Nunca consulta pedido pelo
// número. Nenhum dado do pedido no título, na URL ou em evento de análise.
export const metadata: Metadata = {
  title: "Enviar pedido · Pingo de Mell",
  description: "Envie o seu pedido para a Pingo de Mell pelo WhatsApp.",
  robots: { index: false, follow: false },
};

export default function ConfirmacaoPage() {
  return <Confirmacao />;
}
