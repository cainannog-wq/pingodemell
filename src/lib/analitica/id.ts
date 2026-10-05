import { VERSAO_POLITICA } from "@/lib/site/politica-versao";

// ID de medição do GA4 (PR 2 da Fase 4). Chega ao site só pela variável
// GA4_ID da Netlify, inlinada no build pelo bloco env do next.config.ts;
// nunca fica escrita no código. Sem ID efetivo não existe banner, link de
// preferências, etiqueta nem dataLayer.
//
// Trava de produção: no build de produção (CONTEXTO_NETLIFY "production") o
// ID efetivo é nulo enquanto a Política de Privacidade estiver abaixo da
// versão 2, mesmo com GA4_ID definida. A versão 1 diz que ferramentas de
// análise dependem de atualização prévia da Política; o PR da versão 2
// destrava sozinho ao subir VERSAO_POLITICA.

export const FORMATO_ID_GA4 = /^G-[A-Z0-9]{6,12}$/;

// Regra pura: valor bruto, contexto do build e versão da Política.
export function idGa4Efetivo(bruto: unknown, contexto: unknown, versaoPolitica: number): string | null {
  if (typeof bruto !== "string" || !FORMATO_ID_GA4.test(bruto)) return null;
  if (contexto === "production" && versaoPolitica < 2) return null;
  return bruto;
}

// O ID efetivo deste build. Só no navegador (quem chama já espera a
// montagem): no servidor devolve sempre nulo, para o HTML do servidor e o
// primeiro render do navegador nunca divergirem.
export function lerIdGa4(): string | null {
  if (typeof window === "undefined") return null;
  return idGa4Efetivo(process.env.GA4_ID, process.env.CONTEXTO_NETLIFY, VERSAO_POLITICA);
}
