import { bentoDisponivel, boloDisponivel, menorPrecoKg } from "@/lib/recheios/regras";
import type { Recheio } from "@/lib/recheios/types";
import { semCentoIndisponivel } from "./cento";
import type { ProdutoVitrine } from "./mais-pedidos";
import { variacaoDoProduto } from "./variacao";

// Consulta do catálogo de recheios que a vitrine usa (só as colunas que a
// regra lê). A leitura é pública para o ativo; quem segura o inativo é o
// código (o admin logado navegando no site lê tudo).
export const CAMPOS_RECHEIO_VITRINE = "id, nome, vale_bolo, vale_bento, preco_kg, grupo, ativo";
export type RecheioVitrine = Pick<Recheio, "id" | "nome" | "vale_bolo" | "vale_bento" | "preco_kg" | "grupo" | "ativo">;

// Disponibilidade dos produtos que dependem de outra tabela:
// - Cento sem sabor ativo: indisponível (regra em cento.ts);
// - Bolo sem nenhum recheio ativo com vale_bolo: indisponível;
// - Bento Cake sem nenhum recheio ativo com vale_bento: indisponível.
// Indisponível é como inativo: some da Home e da Lista, e a interna cai na
// 404. Os dois lados do catálogo esvaziam de forma independente, e o Smash
// Cake (avulso) nunca é afetado.
export function semIndisponiveis<T extends ProdutoVitrine>(
  produtos: T[],
  comSabor: Set<string>,
  recheios: RecheioVitrine[]
): T[] {
  const temBolo = boloDisponivel(recheios);
  const temBento = bentoDisponivel(recheios);
  return semCentoIndisponivel(produtos, comSabor).filter((p) => {
    const variacao = variacaoDoProduto(p);
    if (variacao === "bolo") return temBolo;
    if (variacao === "bento") return temBento;
    return true;
  });
}

// Bolo mostra "a partir de R$ X o kg" (o menor R$/kg entre os recheios
// ativos do Bolo) no lugar do campo Preço, que não vale para ele. Os demais
// produtos passam sem mudança.
export function comPrecoAPartirDe<T extends ProdutoVitrine>(produtos: T[], recheios: RecheioVitrine[]): T[] {
  const menor = menorPrecoKg(recheios);
  return produtos.map((p) => (variacaoDoProduto(p) === "bolo" ? { ...p, preco_a_partir_de: menor } : p));
}
