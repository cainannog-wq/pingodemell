import type { Metadata } from "next";
import { DATA_VIGENCIA_POLITICA, PoliticaDePrivacidade } from "./politica";
import "./politica.css";

// Política de Privacidade, versão 2 (texto em ./politica.tsx). Continua
// fora do Google (noindex) mesmo sendo o texto definitivo: ainda sem
// validação jurídica, e o noindex só sai no PR de lançamento (Cainan, PR
// politica-de-privacidade; mantido no PR 5 da Fase 4).
export const metadata: Metadata = {
  title: "Política de Privacidade · Pingo de Mell",
  description:
    "Condições em que a Pingo de Mell trata os dados pessoais de quem visita o site e faz pedidos: dados tratados, finalidades, compartilhamento, prazo de conservação e direitos do titular.",
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
