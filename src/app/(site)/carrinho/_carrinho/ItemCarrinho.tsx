"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/ds";
import { DetalhesDaLinha, FotoDaLinha, textoQuantidadeDaLinha } from "@/components/site/LinhaDoPedido";
import { Seletor } from "@/components/site/Seletor";
import {
  controleDaQuantidade,
  limitesDaLinha,
  passoNaLinha,
  podeEditarNaInterna,
  subtotalDaLinha,
  type LinhaCarrinho,
} from "@/lib/carrinho/regras";
import { formatMoeda } from "@/lib/pedidos/format";
import { ROTAS } from "@/lib/site/rotas";
import { nomeDaUnidade } from "@/lib/vitrine/minimo";
import { erroQuantidade } from "@/lib/vitrine/quantidade";

// Uma linha do carrinho. Tudo que aparece aqui é o que foi gravado no
// navegador quando o item foi adicionado (nome, preço, recheio, formato,
// sabores, foto, observação): nenhuma consulta ao banco. A exibição por
// tipo (foto, detalhes, quantidade fixa) é a mesma do resumo do checkout
// (src/components/site/LinhaDoPedido.tsx).
//
// Quantidade: só Avulso (Smash Cake é um avulso) e Bento Cake têm o
// seletor, travado no mínimo e no step gravados na linha. Cento e Bolo só
// têm o botão de remover; para mudar, remove e adiciona de novo pela interna.

// Seletor da quantidade com o texto digitado à parte: enquanto o número
// digitado não vale (abaixo do mínimo, fora do step), a linha não muda e a
// mensagem aparece; número válido vale na hora; ao sair do campo, o valor
// inválido vai para o aceito mais próximo.
function ControleDaQuantidade({
  linha,
  aoMudar,
}: {
  linha: Extract<LinhaCarrinho, { tipo: "normal" | "bento" }>;
  aoMudar: (quantidade: number) => void;
}) {
  const [digitado, setDigitado] = useState<string | null>(null);
  const controle = controleDaQuantidade(linha);
  const limites = limitesDaLinha(linha);
  if (!controle || !limites) return null;

  const mostrado = digitado ?? String(linha.quantidade);
  const numero = digitado === null ? linha.quantidade : digitado === "" ? NaN : Number(digitado);
  const erro =
    digitado === null
      ? null
      : digitado === ""
        ? `Quantidade mínima: ${limites.minimo}`
        : erroQuantidade(numero, controle.minimo, controle.step);
  const rotulo = `Quantidade de ${linha.nome}`;

  function digitar(texto: string) {
    setDigitado(texto);
    if (texto !== "" && erroQuantidade(Number(texto), controle!.minimo, controle!.step) === null) {
      aoMudar(Number(texto));
      setDigitado(null);
    }
  }

  return (
    <div className="carrinho-quantidade">
      <Seletor
        rotulo={rotulo}
        valor={mostrado}
        invalido={erro !== null}
        podeMenos={erro === null ? limites.podeMenos : true}
        podeMais={erro === null ? limites.podeMais : true}
        aoMenos={() => aoMudar(passoNaLinha(linha, -1))}
        aoMais={() => aoMudar(passoNaLinha(linha, 1))}
        aoDigitar={digitar}
        aoSairDoCampo={() => {
          if (digitado === null) return;
          aoMudar(Number.isFinite(numero) ? numero : limites.minimo);
          setDigitado(null);
        }}
      />
      <p className="carrinho-quantidade-erro" aria-live="polite">
        {erro}
      </p>
    </div>
  );
}

// Nome da unidade que acompanha o seletor e, quando o mínimo passa de 1,
// "mín. N".
function textoDaUnidade(linha: Extract<LinhaCarrinho, { tipo: "normal" | "bento" }>): string {
  const unidade =
    linha.tipo === "normal"
      ? (nomeDaUnidade(linha.quantidade, linha.unidade_venda) ?? "")
      : linha.quantidade === 1
        ? "unidade"
        : "unidades";
  const minimo = linha.pedidoMinimo !== undefined && linha.pedidoMinimo > 1 ? `mín. ${linha.pedidoMinimo}` : "";
  return [unidade, minimo].filter(Boolean).join(" · ");
}

export function ItemCarrinho({
  linha,
  aoRemover,
  aoMudarQuantidade,
}: {
  linha: LinhaCarrinho;
  aoRemover: (linha: LinhaCarrinho) => void;
  aoMudarQuantidade: (id: string, quantidade: number) => void;
}) {
  const comSeletor = (linha.tipo === "normal" || linha.tipo === "bento") && controleDaQuantidade(linha) !== null;

  return (
    <li className="carrinho-item" data-linha={linha.id} data-tipo={linha.tipo}>
      <div className="carrinho-item-foto">
        <FotoDaLinha foto={linha.foto} nome={linha.nome} sizes="(max-width: 767px) 104px, 120px" />
      </div>

      <div className="carrinho-item-topo">
        <h2 className="carrinho-item-nome">{linha.nome}</h2>
        <div className="carrinho-item-acoes">
          {podeEditarNaInterna(linha) ? (
            <Link
              href={`${ROTAS.produto(linha.slug)}?editar=${encodeURIComponent(linha.id)}`}
              className="carrinho-acao carrinho-editar"
              aria-label={`Editar ${linha.nome}`}
            >
              <Icon name="edit" size={22} tone="inherit" />
            </Link>
          ) : null}
        <button
          type="button"
          className="carrinho-acao carrinho-remover"
          data-remover
          data-nao-fecha-avisos
          aria-label={`Remover ${linha.nome} do pedido`}
          onClick={() => aoRemover(linha)}
        >
          <Icon name="delete" size={22} tone="inherit" />
        </button>
        </div>
      </div>

      <div className="carrinho-item-detalhes">
        <DetalhesDaLinha linha={linha} />
      </div>

      {linha.observacao ? (
        <p className="carrinho-item-obs">
          <Icon name="edit_note" size={20} tone="inherit" />
          <span>
            <span className="site-visually-hidden">Observação: </span>
            {linha.observacao}
          </span>
        </p>
      ) : null}

      <div className="carrinho-item-base">
        <div className="carrinho-item-qtd">
          {comSeletor && (linha.tipo === "normal" || linha.tipo === "bento") ? (
            <>
              <ControleDaQuantidade linha={linha} aoMudar={(q) => aoMudarQuantidade(linha.id, q)} />
              <span className="carrinho-item-unidade">{textoDaUnidade(linha)}</span>
            </>
          ) : (
            <span className="carrinho-item-fixo">{textoQuantidadeDaLinha(linha)}</span>
          )}
        </div>
        <span className="carrinho-item-subtotal">
          <span className="site-visually-hidden">Subtotal: </span>
          {formatMoeda(subtotalDaLinha(linha))}
        </span>
      </div>
    </li>
  );
}
