import { unstable_cache, updateTag } from "next/cache";

// Cache da vitrine (PR perf/vitrine-consultas-cache). As leituras públicas
// de Home, Lista e interna ficam guardadas com a etiqueta ETIQUETA_VITRINE:
// toda ação do admin que muda o que a cliente vê chama invalidarVitrine(), e
// a próxima visita já lê o banco de novo. O prazo cobre o que não passa pelo
// admin (SQL à mão, scripts, e o cache da homologação, que é separado do da
// produção, com o mesmo banco).
//
// API escolhida (sem cacheComponents, que mudaria o site inteiro):
// unstable_cache para os dados, updateTag nas Server Actions do admin
// (expira na hora: a próxima visita espera o dado novo) e revalidate por
// página em Home e interna. O valor de `revalidate` das páginas precisa ser
// um número escrito na própria página (o Next o lê no build); o teste
// cache.test.ts confere que ele é igual a PRAZO_VITRINE_SEGUNDOS.

export const ETIQUETA_VITRINE = "vitrine";
export const PRAZO_VITRINE_SEGUNDOS = 60;

// Guarda o resultado de uma leitura pública da vitrine, por argumentos. A
// leitura LANÇA erro em caso de falha: erro não é guardado, então nada que
// falhou vira "sucesso" no cache. Só para leitura sem sessão (cliente sem
// cookie): o que entra aqui é servido para todo mundo.
export function emCacheDaVitrine<A extends unknown[], R>(leitura: (...args: A) => Promise<R>, chave: string) {
  return unstable_cache(leitura, [chave], { tags: [ETIQUETA_VITRINE], revalidate: PRAZO_VITRINE_SEGUNDOS });
}

// Chamada por toda Server Action do admin que muda produto, preço, ativo,
// destaque, categoria, tipo, fotos, capa, composição do Cento ou recheio
// (teste: src/app/admin/invalidacao-vitrine.test.ts).
export function invalidarVitrine() {
  updateTag(ETIQUETA_VITRINE);
}
