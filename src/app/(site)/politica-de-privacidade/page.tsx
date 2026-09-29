import type { Metadata } from "next";
import { DATA_VIGENCIA_POLITICA, PoliticaDePrivacidade } from "./politica";
import "./politica.css";

// Política de Privacidade, versão 1 (texto em ./politica.tsx). Continua
// fora do Google (noindex) mesmo sendo o texto definitivo: vai à produção
// com o lote antes da validação jurídica terminar, e a indexação do site
// inteiro é decisão da Fase 4 (Cainan, PR politica-de-privacidade).
export const metadata: Metadata = {
  title: "Política de Privacidade · Pingo de Mell",
  description:
    "Como a Pingo de Mell trata os dados de quem faz um pedido pelo site: o que coletamos, para que usamos, com quem compartilhamos e por quanto tempo guardamos.",
  robots: { index: false },
};

export default function PoliticaDePrivacidadePage() {
  return (
    <section className="site-section">
      <div className="site-container">
        <PoliticaDePrivacidade dataVigencia={DATA_VIGENCIA_POLITICA} />
      </div>
    </section>
  );
}
