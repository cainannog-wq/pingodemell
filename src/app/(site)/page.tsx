import type { Metadata } from "next";
import { SEO_SITE, metadadosIndexaveis } from "@/lib/site/seo";
import { buscarMaisPedidos } from "@/lib/vitrine/buscar";
import { Categorias } from "./_home/Categorias";
import { ComoFunciona } from "./_home/ComoFunciona";
import { Depoimentos } from "./_home/Depoimentos";
import { Hero } from "./_home/Hero";
import { MaisPedidos } from "./_home/MaisPedidos";
import { Prazos } from "./_home/Prazos";

export const metadata: Metadata = metadadosIndexaveis({ ...SEO_SITE, caminho: "/" });

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
