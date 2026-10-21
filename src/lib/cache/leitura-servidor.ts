import { unstable_cache, updateTag } from "next/cache";

// Cache de leitura do SERVIDOR, para conferências que a rota de pedido faz
// no banco (PR servidor/cento-passo-soma). Diferente do cache da vitrine
// (src/lib/vitrine/cache.ts), que guarda o que a cliente vê por 24 horas, este
// guarda o que o servidor consulta para recusar pedido adulterado, lido com a
// chave de serviço (createAdminClient) e NUNCA servido a ninguém.
//
// Por que existe: a rota POST /api/pedidos não toca o banco antes de validar
// a forma e não pode passar a gerar uma consulta por requisição antes do
// limite por IP. A conferência de sabores lê uma lista inteira de uma vez
// (uma entrada de cache só, não uma por produto), no máximo uma leitura a
// cada PRAZO_LEITURA_SERVIDOR_SEGUNDOS por deploy, qualquer que seja o
// número de requisições.
//
// JANELA DE 5 MINUTOS: o que o servidor sabe vale até 5 minutos. Mudança feita
// fora do admin (SQL à mão, scripts de carga, outro ambiente que lê o mesmo
// banco: a homologação tem cache separado) pode levar até 5 minutos para
// valer na conferência. Nesse intervalo o servidor ainda usa a lista de
// antes: pode recusar um sabor recém-cadastrado ou aceitar um recém-retirado
// (a tela da cliente tem a mesma folga, pois mostra a vitrine em cache).
// Toda ação do admin que muda o que está guardado aqui chama a invalidação
// (invalidarVitrine() expira também as etiquetas deste arquivo), então
// pelo admin a mudança vale na hora, no ambiente em que foi feita.
//
// Reaproveitável: o próximo uso (kits) cria a própria etiqueta e a lista em
// ETIQUETAS_LEITURA_SERVIDOR, e chama emCacheDoServidor com a sua leitura.
//
// A leitura LANÇA erro em caso de falha: erro não é guardado, então nada que
// falhou vira "sucesso" no cache.

export const PRAZO_LEITURA_SERVIDOR_SEGUNDOS = 300;

// Lista dos sabores de cada produto tipo Cento (produto_cento_itens).
export const ETIQUETA_SABORES_CENTO = "sabores-cento";

export const ETIQUETAS_LEITURA_SERVIDOR = [ETIQUETA_SABORES_CENTO] as const;

export function emCacheDoServidor<A extends unknown[], R>(
  leitura: (...args: A) => Promise<R>,
  chave: string,
  etiqueta: (typeof ETIQUETAS_LEITURA_SERVIDOR)[number]
) {
  return unstable_cache(leitura, [chave], { tags: [etiqueta], revalidate: PRAZO_LEITURA_SERVIDOR_SEGUNDOS });
}

// Chamada por invalidarVitrine(): expira na hora todas as etiquetas daqui.
export function invalidarLeiturasDoServidor() {
  for (const etiqueta of ETIQUETAS_LEITURA_SERVIDOR) updateTag(etiqueta);
}
