import type { Metadata } from "next";
import { buscarDadosDoCheckout } from "@/lib/checkout/buscar";
import { Checkout } from "./_checkout/Checkout";
import { CheckoutFalha } from "./_checkout/CheckoutFalha";
// O estado de carrinho vazio é o mesmo da página do carrinho (CarrinhoVazio).
import "../carrinho/carrinho.css";
import "./checkout.css";

export const metadata: Metadata = {
  title: "Finalizar pedido · Pingo de Mell",
  description: "Conte quem é você, a data e como quer receber. O pagamento é combinado pelo WhatsApp.",
  robots: { index: false },
};

// Checkout (página 5 do site). Do banco vêm só os dias sem produção, o
// prazo de produção dos produtos ativos e as ofertas do rodapé
// (src/lib/checkout/buscar.ts). As linhas do carrinho NÃO são reconferidas:
// o resumo e o total são o que ficou gravado no navegador. Nada é gravado
// aqui: o botão final só leva para a confirmação.
export default async function CheckoutPage() {
  const dados = await buscarDadosDoCheckout();
  if (!dados) return <CheckoutFalha />;
  return <Checkout diasOff={dados.diasOff} prazos={dados.prazos} ofertas={dados.ofertas} />;
}
