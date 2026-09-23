import type { Metadata } from "next";
import { LOJA } from "@/lib/site/config";

// CONTEÚDO PROVISÓRIO (23/09/2026): a rota existe pro link do rodapé não
// quebrar. O texto definitivo precisa ser escrito/validado com a cliente
// antes do lançamento — principalmente quando entrarem o formulário de
// checkout (dados pessoais do pedido) e as tags de GA4/Clarity (Fase 4).
export const metadata: Metadata = {
  title: "Política de privacidade · Pingo de Mell",
  robots: { index: false },
};

export default function PoliticaDePrivacidadePage() {
  return (
    <section className="site-section">
      <div className="site-container site-prose">
        <h1>Política de privacidade</h1>
        <p>
          <strong>Página em construção.</strong> Estamos preparando o texto completo da nossa política de privacidade.
        </p>
        <p>
          Dúvidas sobre como a {LOJA.nome} trata os seus dados? Fale com a gente pelo WhatsApp {LOJA.telefone}.
        </p>
      </div>
    </section>
  );
}
