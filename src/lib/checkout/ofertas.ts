import { quantidadeInicial } from "@/lib/vitrine/quantidade";
import type { ProdutoVitrine } from "@/lib/vitrine/mais-pedidos";
import { variacaoDoProduto } from "@/lib/vitrine/variacao";
import { prontoEm } from "./datas";

// Ofertas do rodapé do checkout, em função pura coberta por teste.
//
// Regra (decisão do Cainan, PR checkout-de-verdade):
// - só produto ativo e em destaque, de qualquer categoria: bebida entra
//   aqui (na Home não entra), e o Cento também;
// - Cento sem sabor ativo e Bolo/Bento sem recheio ativo já chegam fora
//   (semIndisponiveis, na busca);
// - some o produto que já está no carrinho (qualquer linha dele);
// - com data escolhida, some o produto que não fica pronto a tempo
//   (hoje + prazo de produção depois da data);
// - na ordem de "Os mais pedidos" (editado mais recentemente primeiro,
//   desempate pelo nome), no máximo LIMITE_OFERTAS.

export const LIMITE_OFERTAS = 5;

export type Oferta = ProdutoVitrine & { prazo_producao_dias: number };

export function ordenarOfertas<T extends Pick<ProdutoVitrine, "atualizado_em" | "nome">>(produtos: T[]): T[] {
  return [...produtos].sort((a, b) => {
    const porData = Date.parse(b.atualizado_em) - Date.parse(a.atualizado_em);
    if (porData !== 0) return porData;
    return a.nome.localeCompare(b.nome, "pt-BR");
  });
}

export function selecionarOfertas(
  candidatos: Oferta[],
  noCarrinho: ReadonlyArray<{ produtoId: string }>,
  dataEscolhida: string | null,
  hoje: string
): Oferta[] {
  const ids = new Set(noCarrinho.map((l) => l.produtoId));
  return ordenarOfertas(
    candidatos.filter((p) => {
      if (p.ativo !== true || p.destaque !== true) return false;
      if (ids.has(p.id)) return false;
      if (dataEscolhida && prontoEm(hoje, Number(p.prazo_producao_dias) || 0) > dataEscolhida) return false;
      return true;
    })
  ).slice(0, LIMITE_OFERTAS);
}

// O que o clique na oferta faz: o avulso (inclui bebida e Smash Cake) entra
// direto no carrinho; Cento, Bolo e Bento Cake precisam de escolha (sabores,
// recheio, tamanho) e levam para a interna.
export type AcaoDaOferta = "adicionar" | "interna";

export function acaoDaOferta(produto: Pick<ProdutoVitrine, "tipo">): AcaoDaOferta {
  return variacaoDoProduto(produto) === "avulso" ? "adicionar" : "interna";
}

// Quantidade com que o avulso entra: o pedido mínimo, subindo até o
// múltiplo do step (a mesma com que a interna começa).
export function quantidadeDaOferta(produto: Pick<ProdutoVitrine, "pedido_minimo" | "step_quantidade">): number {
  return quantidadeInicial(produto.pedido_minimo, produto.step_quantidade);
}
