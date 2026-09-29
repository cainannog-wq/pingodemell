"use client";

import { useState } from "react";
import { useCarrinho } from "@/components/site/CarrinhoProvider";
import { useMontado } from "@/components/site/useMontado";
import { assinaturaDaLinha, linhaParaEditar } from "@/lib/carrinho/regras";
import type { RecheioVitrine } from "@/lib/vitrine/disponibilidade";
import type { ProdutoVitrine } from "@/lib/vitrine/mais-pedidos";
import { AvisoEdicao } from "./AvisoEdicao";
import { ConfigBolo } from "./ConfigBolo";
import { ConfigCento } from "./ConfigCento";
import type { Edicao } from "./edicao";

// Configuração de Cento e de Bolo, com o modo edição. Sem ?editar= na URL é a
// configuração de sempre. Com ?editar={id da linha}:
// - espera montar no navegador (no servidor o carrinho é vazio) e lê a linha
//   do carrinho UMA vez, guardando o retrato dela (Edicao). O vínculo vale se
//   a linha existe e é do mesmo produto e tipo; senão a interna abre em modo
//   comum com o aviso "perdido";
// - com o vínculo, remonta a configuração já preenchida com o que está
//   gravado. O carrinho não muda até a cliente confirmar (ver useConfirmacao).
// A página põe key={editar} neste componente, então trocar de linha remonta.
type Resolucao = { fase: "aguardando" } | { fase: "editando"; edicao: Edicao } | { fase: "perdido" };

type Props =
  | { tipo: "cento"; produto: ProdutoVitrine; sabores: string[]; editarId: string | null }
  | { tipo: "bolo"; produto: ProdutoVitrine; recheios: RecheioVitrine[]; editarId: string | null };

export function ConfigEditavel(props: Props) {
  const { editarId, produto } = props;
  const montado = useMontado();
  const { linhas } = useCarrinho();
  const [resolucao, setResolucao] = useState<Resolucao>({ fase: "aguardando" });

  // Resolve o vínculo uma vez, quando o carrinho do navegador já está lido
  // (ajuste de estado durante o render, o padrão do React para isso).
  if (editarId && montado && resolucao.fase === "aguardando") {
    const linha = linhaParaEditar(linhas, editarId, produto.id, props.tipo);
    setResolucao(linha ? { fase: "editando", edicao: { linha, assinatura: assinaturaDaLinha(linha) } } : { fase: "perdido" });
  }

  const configuracao = (edicao?: Edicao) =>
    props.tipo === "cento" ? (
      <ConfigCento produto={produto} sabores={props.sabores} edicao={edicao} />
    ) : (
      <ConfigBolo produto={produto} recheios={props.recheios} edicao={edicao} />
    );

  if (!editarId) return configuracao();
  if (resolucao.fase === "aguardando") return <div className="interna-edicao-carregando" aria-busy="true" />;
  if (resolucao.fase === "perdido") {
    return (
      <>
        <AvisoEdicao tipo="perdido" />
        {configuracao()}
      </>
    );
  }
  return (
    <>
      <AvisoEdicao tipo="editando" />
      {configuracao(resolucao.edicao)}
    </>
  );
}
