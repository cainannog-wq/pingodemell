import type { SupabaseClient } from "@supabase/supabase-js";
import { montarConfigKit, type KitConfig, type LinhasDoKit } from "./config";

// Leitura da configuração dos kits (tabelas kit_*), com o cliente de quem
// chama: o site lê sem sessão (a RLS devolve só o que é de produto ativo e só
// opção ativa de lista em uso) e o servidor do pedido lê com a chave de
// serviço (tudo, inclusive produto inativo e opção desativada, que podem estar
// num carrinho antigo). LANÇA erro em caso de falha: erro não é guardado em
// cache. Só faz consulta quando chamada: o site não a chama sem haver produto
// do tipo kit_pessoa, então um banco sem as tabelas continua servindo a vitrine.

type Cliente = SupabaseClient;

const CAMPOS = {
  tamanhos: "produto_id, pessoas, bolo_kg, descartaveis",
  grupos: "produto_id, id, chave, rotulo, modo, lista_id, passo, posicao",
  itens: "id, lista_id, nome, descricao, posicao, ativo",
  quantidades: "produto_id, pessoas, grupo_id, opcao_id, total, max_sabores, rotulo",
} as const;

async function ler<T>(cliente: Cliente, tabela: string, campos: string, produtoIds: string[] | null): Promise<T[]> {
  let consulta = cliente.from(tabela).select(campos);
  if (produtoIds && tabela !== "kit_lista_itens") consulta = consulta.in("produto_id", produtoIds);
  const { data, error } = await consulta;
  if (error) throw new Error(`leitura de ${tabela} falhou: ${error.code ?? "sem-codigo"}`);
  return (data ?? []) as unknown as T[];
}

type Com<T> = T & { produto_id: string };

// Configuração de cada kit. produtoIds nulo: todos os produtos com
// composição; com ids: só esses.
export async function lerConfigsDosKits(cliente: Cliente, produtoIds: string[] | null = null): Promise<Record<string, KitConfig>> {
  if (produtoIds && produtoIds.length === 0) return {};
  const [tamanhos, grupos, itens, quantidades] = await Promise.all([
    ler<Com<LinhasDoKit["tamanhos"][number]>>(cliente, "kit_tamanhos", CAMPOS.tamanhos, produtoIds),
    ler<Com<LinhasDoKit["grupos"][number]>>(cliente, "kit_grupos", CAMPOS.grupos, produtoIds),
    ler<LinhasDoKit["itens"][number]>(cliente, "kit_lista_itens", CAMPOS.itens, null),
    ler<Com<LinhasDoKit["quantidades"][number]>>(cliente, "kit_quantidades", CAMPOS.quantidades, produtoIds),
  ]);
  const ids = new Set([...tamanhos, ...grupos].map((l) => String(l.produto_id).toLowerCase()));
  const saida: Record<string, KitConfig> = {};
  for (const id of ids) {
    const doProduto = <T extends { produto_id: string }>(l: T[]) => l.filter((x) => String(x.produto_id).toLowerCase() === id);
    saida[id] = montarConfigKit(id, {
      tamanhos: doProduto(tamanhos),
      grupos: doProduto(grupos),
      itens,
      quantidades: doProduto(quantidades),
    });
  }
  return saida;
}
