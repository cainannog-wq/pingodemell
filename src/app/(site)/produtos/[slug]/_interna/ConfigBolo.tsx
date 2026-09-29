"use client";

import { useState } from "react";
import { Icon } from "@/components/ds";
import { useCarrinho } from "@/components/site/CarrinhoProvider";
import { normalizarObservacao } from "@/lib/carrinho/regras";
import { formatMoeda } from "@/lib/pedidos/format";
import { agruparRecheiosDoBolo, precoDoBolo } from "@/lib/recheios/regras";
import {
  detalheDoBolo,
  erroKg,
  FORMATO_BOLO_LABELS,
  FORMATOS_BOLO,
  KG_MINIMO,
  normalizarKg,
  passoKg,
  KG_MAXIMO,
  TEXTO_DECORACAO,
  TEXTO_FOTO_REFERENCIA,
  textoAvisoKg,
  type FormatoBolo,
} from "@/lib/vitrine/bolo";
import type { RecheioVitrine } from "@/lib/vitrine/disponibilidade";
import type { ProdutoVitrine } from "@/lib/vitrine/mais-pedidos";
import { EscolhaRecheio } from "./EscolhaRecheio";
import { Observacao } from "./Observacao";
import { PainelAdicionar } from "./PainelAdicionar";
import { Seletor } from "./Seletor";

// Configuração do produto tipo Bolo (regras em src/lib/vitrine/bolo.ts e
// src/lib/recheios/regras.ts): tamanho em kg (de 1 em 1; acima de 10 kg só
// avisa para combinar pelo WhatsApp, sem bloquear), formato (informativo),
// um recheio do catálogo (agrupado) e observação do item. O preço é sempre
// R$/kg do recheio × kg; o campo Preço do cadastro não vale aqui. Cada
// "Adicionar ao pedido" é um bolo (uma linha no carrinho).
export function ConfigBolo({ produto, recheios }: { produto: ProdutoVitrine; recheios: RecheioVitrine[] }) {
  const { adicionar } = useCarrinho();
  const grupos = agruparRecheiosDoBolo(recheios);
  const [texto, setTexto] = useState(String(KG_MINIMO));
  const [recheioId, setRecheioId] = useState<string | null>(null);
  const [formato, setFormato] = useState<FormatoBolo>("redondo");
  const [observacao, setObservacao] = useState("");
  const [adicionado, setAdicionado] = useState(false);

  const kg = texto === "" ? NaN : Number(texto);
  const erroDoTamanho = texto === "" ? `Tamanho mínimo: ${KG_MINIMO} kg` : erroKg(kg);
  const recheio = grupos.flatMap((g) => g.recheios).find((r) => r.id === recheioId) ?? null;
  const precoKg = recheio ? Number(recheio.preco_kg) : null;
  const valida = erroDoTamanho === null && recheio !== null;
  const erro = erroDoTamanho ?? (recheio ? null : "Escolha o recheio para adicionar.");
  const aviso = erroDoTamanho === null ? textoAvisoKg(kg) : null;

  function alterar<T>(definir: (v: T) => void) {
    return (v: T) => {
      definir(v);
      setAdicionado(false);
    };
  }

  function aoAdicionar() {
    if (!valida || !recheio || precoKg === null) return;
    adicionar({
      tipo: "bolo",
      produtoId: produto.id,
      slug: produto.slug,
      nome: produto.nome,
      preco: precoKg,
      quantidade: kg,
      recheio: { id: recheio.id, nome: recheio.nome },
      formato,
      observacao: normalizarObservacao(observacao),
    });
    setAdicionado(true);
  }

  return (
    <>
      <div className="interna-bloco">
        <div className="interna-bloco-topo">
          <label className="interna-bloco-titulo" htmlFor="interna-tamanho">
            Tamanho
          </label>
          <span className="interna-bloco-dica">Em quilos, de 1 em 1</span>
        </div>
        <div className="interna-quantidade">
          <Seletor
            rotulo="Tamanho em kg"
            idCampo="interna-tamanho"
            valor={texto}
            invalido={erroDoTamanho !== null}
            podeMenos={erroDoTamanho === null ? kg > KG_MINIMO : true}
            podeMais={erroDoTamanho === null ? kg < KG_MAXIMO : true}
            aoMenos={() => alterar(setTexto)(String(passoKg(kg, -1)))}
            aoMais={() => alterar(setTexto)(String(passoKg(kg, 1)))}
            aoDigitar={alterar(setTexto)}
            aoSairDoCampo={() => setTexto(String(normalizarKg(kg)))}
          />
          <span className="interna-quantidade-unidade">kg</span>
        </div>
        <p className="interna-campo-erro" aria-live="polite">
          {erroDoTamanho ?? ""}
        </p>
        {aviso ? (
          <p className="interna-aviso" role="status">
            <Icon name="info" size={20} tone="inherit" />
            {aviso}
          </p>
        ) : null}
      </div>

      <fieldset className="interna-bloco interna-formato">
        <legend className="interna-bloco-titulo">Formato</legend>
        <div className="interna-formatos">
          {FORMATOS_BOLO.map((f) => (
            <label key={f} className="interna-opcao interna-opcao-pilula" data-marcada={formato === f}>
              <input
                type="radio"
                name="interna-formato"
                value={f}
                checked={formato === f}
                onChange={() => alterar(setFormato)(f)}
              />
              <span className="interna-opcao-nome">{FORMATO_BOLO_LABELS[f]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <EscolhaRecheio
        titulo="Recheio"
        dica="Escolha um. O preço por kg muda conforme o recheio."
        nomeCampo="interna-recheio"
        valor={recheioId}
        aoEscolher={alterar(setRecheioId)}
        grupos={grupos.map((g) => ({
          chave: g.grupo,
          rotulo: g.rotulo,
          opcoes: g.recheios.map((r) => ({ id: r.id, nome: r.nome, detalhe: `${formatMoeda(Number(r.preco_kg))} o kg` })),
        }))}
      />

      <Observacao
        id="interna-observacao"
        valor={observacao}
        aoMudar={alterar(setObservacao)}
        exemplo="Ex.: tema da festa, nome e idade no topo, cores da decoração..."
      />

      <p className="interna-nota">
        <Icon name="photo_camera" size={20} color="var(--brown-700)" />
        <span>
          {TEXTO_FOTO_REFERENCIA} {TEXTO_DECORACAO}
        </span>
      </p>

      <PainelAdicionar
        subtotal={valida && precoKg !== null ? precoDoBolo(precoKg, kg) : 0}
        detalhe={
          valida && precoKg !== null
            ? detalheDoBolo(precoKg, kg)
            : recheio
              ? "Confira o tamanho"
              : "Escolha o recheio"
        }
        podeAdicionar={valida}
        erro={valida ? null : erro}
        adicionado={adicionado}
        aoAdicionar={aoAdicionar}
      />
    </>
  );
}
