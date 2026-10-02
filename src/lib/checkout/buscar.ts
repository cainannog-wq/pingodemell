import { createClient } from "@/lib/supabase/server";
import { hojeBrasilia } from "@/lib/tempo/brasilia";
import { dependencias } from "@/lib/vitrine/buscar";
import { comPrecoAPartirDe, semIndisponiveis } from "@/lib/vitrine/disponibilidade";
import { CAMPOS_VITRINE } from "@/lib/vitrine/mais-pedidos";
import { ordenarOfertas, type Oferta } from "./ofertas";

// O que o checkout lê do banco. NADA aqui confere as linhas do carrinho
// (preço, produto ou recheio ativo): o carrinho mora no navegador e o
// servidor nem sabe o que tem nele. Risco aceito (decisão do Cainan): o
// pedido segue com o que ficou gravado em cada linha, e a Taami resolve
// qualquer diferença no WhatsApp.
//
// Três leituras, todas públicas (a mesma chave anônima da vitrine):
// - dias sem produção (dias_off) de hoje em diante: bloqueiam a data;
// - prazo de produção de todos os produtos ativos (id -> dias): o
//   navegador acha o item mais demorado do carrinho e avisa (sem
//   bloquear) quando a data escolhida vem antes de ele ficar pronto.
//   Vêm todos os ativos porque o servidor não sabe o que está no carrinho;
//   produto desativado depois de entrar no carrinho não está aqui e fica
//   fora do aviso;
// - candidatos às ofertas do rodapé: ativos e em destaque, sem os
//   indisponíveis (Cento sem sabor, Bolo/Bento sem recheio). O filtro final
//   (carrinho, data, limite) é no navegador (selecionarOfertas).
//
// O filtro de ativo fica na consulta E no código: o admin logado navegando
// no site recebe também os inativos.

export type DadosDoCheckout = {
  diasOff: string[];
  prazos: Record<string, number>;
  ofertas: Oferta[];
};

export async function buscarDadosDoCheckout(): Promise<DadosDoCheckout | null> {
  const supabase = await createClient();
  const hoje = hojeBrasilia();

  const [diasOff, produtos] = await Promise.all([
    supabase.from("dias_off").select("data").gte("data", hoje),
    supabase.from("produtos").select(`${CAMPOS_VITRINE}, prazo_producao_dias`).eq("ativo", true),
  ]);

  if (diasOff.error) {
    console.error("Falha ao buscar os dias sem produção:", diasOff.error.message);
    return null;
  }
  if (produtos.error) {
    console.error("Falha ao buscar os produtos do checkout:", produtos.error.message);
    return null;
  }

  const ativos = ((produtos.data ?? []) as Oferta[]).filter((p) => p.ativo === true);
  const prazos: Record<string, number> = {};
  for (const p of ativos) prazos[p.id] = Number(p.prazo_producao_dias) || 0;

  const destaques = ativos.filter((p) => p.destaque === true);
  const dep = await dependencias(supabase, destaques);
  if (!dep) return null;

  return {
    diasOff: ((diasOff.data ?? []) as { data: string }[]).map((d) => d.data),
    prazos,
    ofertas: ordenarOfertas(comPrecoAPartirDe(semIndisponiveis(destaques, dep.comSabor, dep.recheios), dep.recheios)),
  };
}
