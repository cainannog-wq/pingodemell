"use client";

import { useSearchParams } from "next/navigation";
import type { RecheioVitrine } from "@/lib/vitrine/disponibilidade";
import type { ProdutoVitrine } from "@/lib/vitrine/mais-pedidos";
import { ConfigEditavel } from "./ConfigEditavel";

type Props =
  | { tipo: "cento"; produto: ProdutoVitrine; sabores: string[] }
  | { tipo: "bolo"; produto: ProdutoVitrine; recheios: RecheioVitrine[] };

// O ?editar={id da linha do carrinho} lido no navegador, não no servidor:
// a interna fica em cache na borda, igual para todo mundo, e só o navegador
// sabe a busca da URL (PR perf/vitrine-consultas-cache). A página põe este
// componente dentro de um Suspense cujo substituto é a configuração comum:
// no HTML guardado aparece a configuração comum (sem JavaScript, nenhum
// botão funciona), e no navegador este componente a troca pela versão com
// o ?editar=, já com o carrinho lido (ver ConfigEditavel). Trocar de linha
// (key) remonta.
export function ConfigEditavelDaUrl(props: Props) {
  const editarId = useSearchParams().get("editar") || null;
  const key = editarId ?? "novo";
  return props.tipo === "cento" ? (
    <ConfigEditavel key={key} tipo="cento" produto={props.produto} sabores={props.sabores} editarId={editarId} />
  ) : (
    <ConfigEditavel key={key} tipo="bolo" produto={props.produto} recheios={props.recheios} editarId={editarId} />
  );
}
