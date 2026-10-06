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

// Página inteira em cache, servida pela borda (PR perf/vitrine-consultas-
// cache): montada no build e de novo a cada 24 horas (PRAZO_VITRINE_SEGUNDOS,
// src/lib/vitrine/cache.ts; o Next exige o número escrito aqui), ou na hora
// quando o admin salva algo que muda a vitrine. Nada aqui lê cookie nem
// sessão. Se "Os mais pedidos" falhar, a Home sai sem a seção, como sempre.
export const revalidate = 86400;

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
