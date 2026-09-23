import type { Metadata } from "next";
import { buscarMaisPedidos } from "@/lib/vitrine/buscar";
import { Categorias } from "./_home/Categorias";
import { ComoFunciona } from "./_home/ComoFunciona";
import { Depoimentos } from "./_home/Depoimentos";
import { Hero } from "./_home/Hero";
import { MaisPedidos } from "./_home/MaisPedidos";
import { Prazos } from "./_home/Prazos";

export const metadata: Metadata = {
  title: "Pingo de Mell · Bolos, doces e salgados sob encomenda em Fazenda Rio Grande",
  description:
    "Bolos, salgados, doces e kits festa feitos sob encomenda, com o mesmo cuidado desde o primeiro pedido. Você monta tudo aqui e a gente combina o resto pelo WhatsApp.",
};

export default async function HomePage() {
  const maisPedidos = await buscarMaisPedidos();

  return (
    <>
      <Hero />
      <Categorias />
      <MaisPedidos produtos={maisPedidos} />
      <Prazos />
      <Depoimentos />
      <ComoFunciona />
    </>
  );
}
