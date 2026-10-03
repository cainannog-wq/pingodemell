import type { Metadata } from "next";
import { metadadosIndexaveis } from "@/lib/site/seo";
import { ROTAS } from "@/lib/site/rotas";
import { FRASE_TOPO, QuemSomos } from "./_quem-somos/QuemSomos";
import "./quem-somos.css";

// Página estática: sem formulário, sem armazenamento no navegador e sem
// nada de terceiro (o mapa é ilustração; o Google Maps só abre no clique).
// Canonical e Open Graph: metadadosIndexaveis (src/lib/site/seo.ts).
export const metadata: Metadata = metadadosIndexaveis({
  titulo: "Quem Somos · Pingo de Mell",
  descricao: FRASE_TOPO,
  caminho: ROTAS.quemSomos,
});

export default function QuemSomosPage() {
  return <QuemSomos />;
}
