"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/ds";
import { Hive } from "@/components/site/Hive";
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
import { FORMATO_BOLO_LABELS } from "@/lib/vitrine/bolo";
import { UNIDADES_POR_CENTO } from "@/lib/vitrine/cento";
import { textoUnidadeVenda } from "@/lib/vitrine/mais-pedidos";
import { nomeDaUnidade, textoQuantidadeNaUnidade } from "@/lib/vitrine/minimo";
import { erroQuantidade } from "@/lib/vitrine/quantidade";

// Uma linha do carrinho. Tudo que aparece aqui é o que foi gravado no
// navegador quando o item foi adicionado (nome, preço, recheio, formato,
// sabores, foto, observação): nenhuma consulta ao banco.
//
// Quantidade: só Avulso (Smash Cake é um avulso) e Bento Cake têm o
// seletor, travado no mínimo e no step gravados na linha. Cento e Bolo só
// têm o botão de remover; para mudar, remove e adiciona de novo pela interna.

function FotoDoItem({ foto, nome }: { foto: string | null | undefined; nome: string }) {
  const [falhou, setFalhou] = useState(false);
  if (foto && !falhou) {
    return (
      <Image
        src={foto}
        alt={`Foto de ${nome}`}
        fill
        sizes="(max-width: 767px) 104px, 120px"
        style={{ objectFit: "cover" }}
        onError={() => setFalhou(true)}
      />
    );
  }
  return (
    <div className="carrinho-item-fallback" role="img" aria-label={`${nome}: foto ainda não disponível`}>
      <Hive />
    </div>
  );
}

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

// Valor em reais que não quebra no meio ("R$" numa linha e "95,99" na outra).
function Dinheiro({ valor }: { valor: number }) {
  return <span className="carrinho-nb">{formatMoeda(valor)}</span>;
}

function Detalhes({ linha }: { linha: LinhaCarrinho }) {
  if (linha.tipo === "cento") {
    const total = linha.quantidade * UNIDADES_POR_CENTO;
    return (
      <>
        <p>
          {linha.sabores
            .filter((s) => s.quantidade > 0)
            .map((s) => `${s.nome} ${s.quantidade}`)
            .join(" · ")}
        </p>
        <p>
          {linha.quantidade} {linha.quantidade === 1 ? "cento" : "centos"} · {total} unidades · <Dinheiro valor={linha.preco} />{" "}
          {textoUnidadeVenda({ tipo: "cento", unidade_venda: null })}
        </p>
      </>
    );
  }
  if (linha.tipo === "bolo") {
    return (
      <>
        <p>
          Recheio: {linha.recheio.nome} · Formato: {FORMATO_BOLO_LABELS[linha.formato]}
        </p>
        <p>
          {linha.quantidade} kg × <Dinheiro valor={linha.preco} /> o kg
        </p>
      </>
    );
  }
  if (linha.tipo === "bento") {
    return (
      <>
        <p>Recheio: {linha.recheio.nome}</p>
        <p>
          <Dinheiro valor={linha.preco} /> cada
        </p>
      </>
    );
  }
  const unidade = textoUnidadeVenda({ tipo: "normal", unidade_venda: linha.unidade_venda });
  return (
    <p>
      <Dinheiro valor={linha.preco} />
      {unidade ? ` ${unidade}` : null}
    </p>
  );
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
        <FotoDoItem foto={linha.foto} nome={linha.nome} />
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
        <Detalhes linha={linha} />
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
            <span className="carrinho-item-fixo">
              {linha.tipo === "normal"
                ? textoQuantidadeNaUnidade(linha.quantidade, linha.unidade_venda)
                : linha.tipo === "bolo"
                  ? `${linha.quantidade} kg`
                  : linha.tipo === "cento"
                    ? `${linha.quantidade} ${linha.quantidade === 1 ? "cento" : "centos"}`
                    : `${linha.quantidade} ${linha.quantidade === 1 ? "unidade" : "unidades"}`}
            </span>
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
