"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useCarrinho } from "@/components/site/CarrinhoProvider";
import type { LinhaCarrinho, LinhaEditavel, NovaLinha } from "@/lib/carrinho/regras";
import { ROTAS } from "@/lib/site/rotas";

// Edição de uma linha de Cento ou de Bolo na interna (?editar={id da linha}).
// `linha` é a linha como estava quando a edição abriu; `assinatura`, o retrato
// dela, para conferir na hora de confirmar que ninguém a mexeu em outra aba.
export type Edicao = { linha: LinhaEditavel; assinatura: string };

export const ROTULO_ADICIONAR = "Adicionar ao pedido";
export const ROTULO_SALVAR = "Salvar alteração";
export const AVISO_VIROU_ITEM_NOVO =
  "Adicionado como item novo: o item que você estava editando já não estava igual no seu pedido.";

// Confirmar da interna, para Cento e Bolo. Em modo edição, troca a linha
// original pela editada (mesma posição, sem juntar com outra) e leva ao
// carrinho. Se a linha original sumiu ou mudou desde que a edição abriu, NÃO
// troca nada: entra como adição comum (a original, se ainda existe, fica
// como está) e a interna avisa. Fora do modo edição é a adição de sempre.
export function useConfirmacao(edicao: Edicao | undefined) {
  const { adicionar, substituir } = useCarrinho();
  const router = useRouter();
  const [virouNovo, setVirouNovo] = useState(false);
  const emEdicao = edicao !== undefined && !virouNovo;

  function confirmar(nova: NovaLinha): "substituiu" | "adicionou" {
    if (edicao && emEdicao) {
      const editada = { ...nova, id: edicao.linha.id } as LinhaCarrinho;
      if (substituir(edicao.linha.id, editada, edicao.assinatura)) {
        router.push(ROTAS.carrinho);
        return "substituiu";
      }
      setVirouNovo(true);
    }
    adicionar(nova);
    return "adicionou";
  }

  return { emEdicao, virouNovo, confirmar };
}
