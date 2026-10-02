import type { Metadata } from "next";
import { FRASE_TOPO, QuemSomos } from "./_quem-somos/QuemSomos";
import "./quem-somos.css";

// Página estática: sem formulário, sem armazenamento no navegador e sem
// nada de terceiro (o mapa é ilustração; o Google Maps só abre no clique).
// SEO completo fica para a Fase 4.
export const metadata: Metadata = {
  title: "Quem Somos · Pingo de Mell",
  description: FRASE_TOPO,
};

export default function QuemSomosPage() {
  return <QuemSomos />;
}
