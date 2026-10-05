import { VERSAO_POLITICA } from "@/lib/site/politica-versao";
import { diferencaEmDias, hojeBrasilia, lerDataIso } from "@/lib/tempo/brasilia";

// Escolha de cookies da visitante (PR 2 da Fase 4), no localStorage, chave
// pdm-consentimento-v1: { versao, escolha, data, versaoPolitica }.
// - escolha: "aceito" ou "recusado";
// - data: o dia da escolha, AAAA-MM-DD no fuso da loja (hojeBrasilia);
// - versaoPolitica: a versão da Política de Privacidade vigente na escolha.
// Vale 180 dias, para o aceite e para a recusa. Escolha vencida, de outra
// versão da Política ou com valor inválido não vale: o banner pergunta de
// novo. Só existe com ID do GA4 efetivo (o banner não aparece sem ele).
//
// Loja externa para o useSyncExternalStore (como o carrinho): no servidor
// e antes de montar não há escolha; o valor devolvido é o mesmo objeto
// enquanto o texto salvo e o dia não mudam. Se o localStorage falhar, a
// escolha fica só na memória da página: o banner volta na próxima carga e o
// site funciona igual.

export const CHAVE_CONSENTIMENTO = "pdm-consentimento-v1";
export const VALIDADE_CONSENTIMENTO_DIAS = 180;
const VERSAO = 1;

export type Escolha = "aceito" | "recusado";
export type Consentimento = { versao: 1; escolha: Escolha; data: string; versaoPolitica: number };

// Regra pura: texto salvo, dia de hoje e versão vigente da Política.
export function lerConsentimentoDe(texto: string | null, hoje: string, versaoPolitica: number): Consentimento | null {
  if (!texto) return null;
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch {
    return null;
  }
  if (!bruto || typeof bruto !== "object") return null;
  const c = bruto as Record<string, unknown>;
  if (c.versao !== VERSAO) return null;
  if (c.escolha !== "aceito" && c.escolha !== "recusado") return null;
  if (typeof c.data !== "string" || !lerDataIso(c.data)) return null;
  if (c.versaoPolitica !== versaoPolitica) return null;
  const idade = diferencaEmDias(c.data, hoje);
  if (idade < 0 || idade > VALIDADE_CONSENTIMENTO_DIAS) return null;
  return { versao: VERSAO, escolha: c.escolha, data: c.data, versaoPolitica };
}

export function escreverConsentimento(escolha: Escolha, hoje: string, versaoPolitica: number): string {
  const valor: Consentimento = { versao: VERSAO, escolha, data: hoje, versaoPolitica };
  return JSON.stringify(valor);
}

// ---------- Loja do navegador ----------

const ouvintes = new Set<() => void>();
let naMemoria: string | null = null;
let soNaMemoria = false;
let textoEmCache: string | null | undefined;
let diaEmCache: string | undefined;
let valorEmCache: Consentimento | null = null;

function lerTexto(): string | null {
  if (soNaMemoria) return naMemoria;
  try {
    return window.localStorage.getItem(CHAVE_CONSENTIMENTO);
  } catch {
    soNaMemoria = true;
    return naMemoria;
  }
}

export function lerConsentimento(): Consentimento | null {
  const texto = lerTexto();
  const hoje = hojeBrasilia();
  if (texto !== textoEmCache || hoje !== diaEmCache) {
    textoEmCache = texto;
    diaEmCache = hoje;
    valorEmCache = lerConsentimentoDe(texto, hoje, VERSAO_POLITICA);
  }
  return valorEmCache;
}

export function lerConsentimentoNoServidor(): Consentimento | null {
  return null;
}

export function assinarConsentimento(aoMudar: () => void): () => void {
  ouvintes.add(aoMudar);
  const aoMudarEmOutraAba = (e: StorageEvent) => {
    if (e.key === CHAVE_CONSENTIMENTO || e.key === null) aoMudar();
  };
  window.addEventListener("storage", aoMudarEmOutraAba);
  return () => {
    ouvintes.delete(aoMudar);
    window.removeEventListener("storage", aoMudarEmOutraAba);
  };
}

export function gravarConsentimento(escolha: Escolha): void {
  const texto = escreverConsentimento(escolha, hojeBrasilia(), VERSAO_POLITICA);
  naMemoria = texto;
  if (!soNaMemoria) {
    try {
      window.localStorage.setItem(CHAVE_CONSENTIMENTO, texto);
    } catch {
      soNaMemoria = true;
    }
  }
  for (const ouvinte of ouvintes) ouvinte();
}

// Só para testes: volta ao estado de página recém-aberta.
export function reiniciarConsentimentoParaTeste(): void {
  naMemoria = null;
  soNaMemoria = false;
  textoEmCache = undefined;
  diaEmCache = undefined;
  valorEmCache = null;
  ouvintes.clear();
}
