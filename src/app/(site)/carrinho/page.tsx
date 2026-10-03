import type { Metadata } from "next";
import { Carrinho } from "./_carrinho/Carrinho";
import "./carrinho.css";

export const metadata: Metadata = {
  title: "Seu pedido · Pingo de Mell",
  description: "Confira os itens do seu pedido antes de enviar. O pagamento é combinado pelo WhatsApp.",
  // Fora dos buscadores com a trava de indexação em qualquer valor.
  robots: { index: false },
};

// Carrinho (página 4 do site). Estática: não busca nada no banco. As linhas
// moram no navegador (localStorage) e são lidas pelo CarrinhoProvider.
export default function CarrinhoPage() {
  return <Carrinho />;
}
