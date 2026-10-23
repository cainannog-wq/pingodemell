import { ETIQUETA_CONFIG_KITS, emCacheDoServidor } from "@/lib/cache/leitura-servidor";
import type { KitConfig } from "@/lib/kit/config";
import { validarEscolhas } from "@/lib/kit/escolhas";
import { lerConfigsDosKits } from "@/lib/kit/leitura";
import { montarRetrato, textoDaComposicao } from "@/lib/kit/texto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ItemGravado } from "./validacao";

// Conferência dos kits por pessoa no pedido (PR 3+4 do Kit Festa por pessoa).
// O corpo leva só pares [id da opção, quantidade] por grupo; aqui o servidor
// confere contra a configuração do kit (tamanho existe, quantidade de cada
// grupo, passo, soma, máximo de sabores) e monta, com os NOMES da
// configuração, o texto da composição que vai em `variacao` (o painel o mostra
// com quebras de linha).
//
// A configuração vem de UMA leitura de todos os kits (cache de 5 minutos, ver
// src/lib/cache/leitura-servidor.ts), com a chave de serviço, depois de a
// forma passar e só se o pedido tem kit. Decisões do Cainan (21/10/2026):
// - falha de leitura sem cópia anterior: a rota responde 500 e a tela mostra
//   "Tentar de novo" (o pedido não grava sem nomes);
// - id de opção que a configuração não conhece: ACEITO, gravado com o texto
//   "opção não encontrada" e aviso no log (a atendente concilia; o cache pode
//   estar até 5 minutos atrás de uma opção nova);
// - produto que não está na configuração (kit apagado ou ainda não visto pelo
//   cache): ACEITO, sem conferência, com aviso no log; a mensagem do WhatsApp
//   traz a composição com nomes, que a tela montou.
// Uma composição que não fecha (soma, passo, máximo, quantidade) é recusada.

export type ConfigsDosKits = Record<string, KitConfig>;

async function lerTodosOsKits(): Promise<ConfigsDosKits> {
  return lerConfigsDosKits(createAdminClient());
}

export const configsDosKitsEmCache = emCacheDoServidor(lerTodosOsKits, "pedido-config-kits", ETIQUETA_CONFIG_KITS);

export const MENSAGEM_KIT_NAO_CONFERE = "A composição de um kit do pedido não confere com o kit. Monte o kit de novo.";
export const TEXTO_KIT_NAO_CONFERIDO = "Composição não conferida pelo site";

export function temKit(itens: ItemGravado[]): boolean {
  return itens.some((i) => i.tipo === "kit");
}

export type ConferenciaKits =
  | { ok: true; itens: ItemGravado[]; desconhecidos: number; opcoesDesconhecidas: number }
  | { ok: false; mensagem: string };

export function conferirKits(itens: ItemGravado[], configs: ConfigsDosKits): ConferenciaKits {
  let desconhecidos = 0;
  let opcoesDesconhecidas = 0;
  const conferidos: ItemGravado[] = [];
  for (const item of itens) {
    if (item.tipo !== "kit") {
      conferidos.push(item);
      continue;
    }
    const config = configs[item.produto_id];
    const escolhas = item.escolhas ?? {};
    if (!config) {
      desconhecidos += 1;
      conferidos.push({ ...item, variacao: TEXTO_KIT_NAO_CONFERIDO });
      continue;
    }
    const r = validarEscolhas(config, item.quantidade, escolhas, "servidor");
    if (!r.ok) return { ok: false, mensagem: MENSAGEM_KIT_NAO_CONFERE };
    opcoesDesconhecidas += r.avisos.length;
    conferidos.push({ ...item, variacao: textoDaComposicao(montarRetrato(config, item.quantidade, escolhas, item.formato)) });
  }
  return { ok: true, itens: conferidos, desconhecidos, opcoesDesconhecidas };
}
