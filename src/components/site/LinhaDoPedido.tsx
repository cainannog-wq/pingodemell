"use client";

import Image from "next/image";
import { useState } from "react";
import { Hive } from "@/components/site/Hive";
import type { LinhaCarrinho } from "@/lib/carrinho/regras";
import { formatMoeda } from "@/lib/pedidos/format";
import { FORMATO_BOLO_LABELS } from "@/lib/vitrine/bolo";
import { UNIDADES_POR_CENTO } from "@/lib/vitrine/cento";
import { textoUnidadeVenda } from "@/lib/vitrine/mais-pedidos";
import { textoQuantidadeNaUnidade } from "@/lib/vitrine/minimo";

// Exibição de uma linha do carrinho por tipo (Avulso, Cento, Bolo, Bento
// Cake; o Smash Cake é um avulso), igual na página do carrinho e no resumo
// do checkout. Tudo sai do que foi gravado no navegador quando o item foi
// adicionado: nenhuma consulta ao banco.

export function FotoDaLinha({ foto, nome, sizes }: { foto: string | null | undefined; nome: string; sizes: string }) {
  const [falhou, setFalhou] = useState(false);
  if (foto && !falhou) {
    return <Image src={foto} alt={`Foto de ${nome}`} fill sizes={sizes} style={{ objectFit: "cover" }} onError={() => setFalhou(true)} />;
  }
  return (
    <div className="site-linha-fallback" role="img" aria-label={`${nome}: foto ainda não disponível`}>
      <Hive />
    </div>
  );
}

// Valor em reais que não quebra no meio ("R$" numa linha e "95,99" na outra).
export function Dinheiro({ valor }: { valor: number }) {
  return <span className="site-nb">{formatMoeda(valor)}</span>;
}

// Sabores, recheio, formato e preço unitário, conforme o tipo.
export function DetalhesDaLinha({ linha }: { linha: LinhaCarrinho }) {
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

// Quantidade como texto fixo: "20 unidades", "2 kg", "2 centos", "3 unidades".
export function textoQuantidadeDaLinha(linha: LinhaCarrinho): string {
  if (linha.tipo === "normal") return textoQuantidadeNaUnidade(linha.quantidade, linha.unidade_venda);
  if (linha.tipo === "bolo") return `${linha.quantidade} kg`;
  if (linha.tipo === "cento") return `${linha.quantidade} ${linha.quantidade === 1 ? "cento" : "centos"}`;
  return `${linha.quantidade} ${linha.quantidade === 1 ? "unidade" : "unidades"}`;
}
