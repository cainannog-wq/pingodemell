"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
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

// Ida ao carrinho depois de confirmar (desde o PR de ajustes visuais de
// 07/10/2026): a linha já está gravada no localStorage quando a navegação
// começa (adicionar e substituir gravam na hora), e a navegação é do próprio
// Next, sem recarregar a página, então o add_to_cart já entregue ao gtag
// segue viagem. A trava (ref, que vale já no segundo clique, antes de a tela
// atualizar) faz um duplo clique confirmar uma vez só; `indo` desliga o botão.
function useIrAoCarrinho() {
  const router = useRouter();
  const travado = useRef(false);
  const [indo, setIndo] = useState(false);

  function travar(): boolean {
    if (travado.current) return false;
    travado.current = true;
    return true;
  }
  function soltar() {
    travado.current = false;
  }
  function ir() {
    setIndo(true);
    router.push(ROTAS.carrinho);
  }

  return { indo, travar, soltar, ir };
}

// Avulso e Bento Cake: adiciona e leva ao carrinho.
export function useAdicionarEIrAoCarrinho() {
  const { adicionar } = useCarrinho();
  const { indo, travar, ir } = useIrAoCarrinho();

  function adicionarEIr(nova: NovaLinha): boolean {
    if (!travar()) return false;
    adicionar(nova);
    ir();
    return true;
  }

  return { indo, adicionarEIr };
}

// Confirmar da interna, para Cento e Bolo. Em modo edição, troca a linha
// original pela editada (mesma posição, sem juntar com outra) e leva ao
// carrinho. Se a linha original sumiu ou mudou desde que a edição abriu, NÃO
// troca nada: entra como adição comum (a original, se ainda existe, fica
// como está), a interna avisa e a cliente continua na página para ler o
// aviso. Fora do modo edição é a adição de sempre, que também leva ao
// carrinho.
export function useConfirmacao(edicao: Edicao | undefined) {
  const { adicionar, substituir } = useCarrinho();
  const { indo, travar, soltar, ir } = useIrAoCarrinho();
  const [virouNovo, setVirouNovo] = useState(false);
  const emEdicao = edicao !== undefined && !virouNovo;

  function confirmar(nova: NovaLinha): "substituiu" | "adicionou" | "ignorado" {
    if (!travar()) return "ignorado";
    if (edicao && emEdicao) {
      const editada = { ...nova, id: edicao.linha.id } as LinhaCarrinho;
      if (substituir(edicao.linha.id, editada, edicao.assinatura)) {
        ir();
        return "substituiu";
      }
      setVirouNovo(true);
      adicionar(nova);
      soltar();
      return "adicionou";
    }
    adicionar(nova);
    ir();
    return "adicionou";
  }

  return { emEdicao, virouNovo, confirmar, indo };
}
