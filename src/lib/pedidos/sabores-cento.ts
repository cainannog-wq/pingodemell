import { createAdminClient } from "@/lib/supabase/admin";
import { ETIQUETA_SABORES_CENTO, emCacheDoServidor } from "@/lib/cache/leitura-servidor";
import type { ItemGravado } from "./validacao";

// Regra 5 dos sabores do Cento no pedido (PR servidor/cento-passo-soma): cada
// sabor da linha tem que existir na lista do próprio produto
// (produto_cento_itens, ligada pelo nome do produto). Conta a linha da lista
// mesmo com o sabor inativo: a tela mantém no carrinho um sabor que ficou
// inativo depois de adicionado.
//
// O mapa vem de UMA leitura de todos os Centos (cache de 5 minutos, ver
// src/lib/cache/leitura-servidor.ts). Produto que não está no mapa (id que não
// existe, produto apagado, desativado e fora do tipo Cento depois de
// adicionado) NÃO é recusado: a tela permite, o servidor só registra um aviso.

export type SaboresPorProduto = Record<string, string[]>;

async function lerSaboresDosCentos(): Promise<SaboresPorProduto> {
  const { data, error } = await createAdminClient()
    .from("produtos")
    .select("id, sabores:produto_cento_itens!produto_cento_itens_cento_nome_fkey(subitem_nome)")
    .eq("tipo", "cento");
  if (error) throw new Error(`leitura dos sabores do Cento falhou: ${error.code ?? "sem-codigo"}`);
  const mapa: SaboresPorProduto = {};
  for (const p of (data ?? []) as { id: string; sabores: { subitem_nome: string }[] | null }[]) {
    mapa[String(p.id).toLowerCase()] = (p.sabores ?? []).map((s) => s.subitem_nome);
  }
  return mapa;
}

export const saboresDosCentosEmCache = emCacheDoServidor(lerSaboresDosCentos, "pedido-sabores-cento", ETIQUETA_SABORES_CENTO);

export const MENSAGEM_SABOR_FORA_DA_LISTA = "Um Cento do pedido está com um sabor que não é deste produto.";

export type ConferenciaSabores =
  | { ok: true; desconhecidos: number }
  | { ok: false; mensagem: string };

export function temCento(itens: ItemGravado[]): boolean {
  return itens.some((i) => i.tipo === "cento");
}

// `desconhecidos` = linhas de Cento cujo produto não está no mapa.
export function conferirSaboresDoCento(itens: ItemGravado[], porProduto: SaboresPorProduto): ConferenciaSabores {
  let desconhecidos = 0;
  for (const item of itens) {
    if (item.tipo !== "cento") continue;
    const lista = porProduto[item.produto_id];
    if (!lista) {
      desconhecidos += 1;
      continue;
    }
    if ((item.sabores ?? []).some((s) => !lista.includes(s.nome))) {
      return { ok: false, mensagem: MENSAGEM_SABOR_FORA_DA_LISTA };
    }
  }
  return { ok: true, desconhecidos };
}
