"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "@/components/ds";
import { dataCompleta, LIMITE_DIAS_A_FRENTE, nomeDoMes, TEXTO_MOTIVO, type MotivoBloqueio } from "@/lib/checkout/datas";
import { diaDaSemana, diasNoMes, lerDataIso, montarDataIso, somarDias, somarMeses } from "@/lib/tempo/brasilia";
import { gradeDoMes } from "@/lib/tempo/grade-do-mes";

// Calendário da data do pedido (design: 5 - Checkout.dc.html, etapa
// "Quando é a festa?"). Data bloqueada (antecedência, segunda, dia sem
// produção, fim de semana fora do prazo) fica visível e alcançável pelo
// teclado, com o motivo no rótulo, mas não pode ser escolhida. Data em que o
// item mais demorado ainda não fica pronto ("prazo curto") pode ser
// escolhida: ganha só uma marca e a tela avisa.
//
// Teclado (padrão de grade de datas): só um dia recebe Tab; setas andam um
// dia ou uma semana (e trocam de mês nas pontas), Home/End vão ao começo e
// ao fim da semana, PageUp/PageDown trocam de mês; Enter ou espaço escolhem.

const SEMANA = [
  { curto: "D", completo: "domingo" },
  { curto: "S", completo: "segunda-feira" },
  { curto: "T", completo: "terça-feira" },
  { curto: "Q", completo: "quarta-feira" },
  { curto: "Q", completo: "quinta-feira" },
  { curto: "S", completo: "sexta-feira" },
  { curto: "S", completo: "sábado" },
];

type Mes = { ano: number; mes: number };

function mesDe(iso: string): Mes {
  const d = lerDataIso(iso)!;
  return { ano: d.ano, mes: d.mes };
}

function mesmoMes(a: Mes, b: Mes) {
  return a.ano === b.ano && a.mes === b.mes;
}

function antes(a: Mes, b: Mes) {
  return a.ano < b.ano || (a.ano === b.ano && a.mes < b.mes);
}

// Mesmo dia no mês vizinho (31/01 + 1 mês -> 28/02).
function somarUmMes(iso: string, delta: number): string {
  const { ano, mes, dia } = lerDataIso(iso)!;
  const alvo = somarMeses(ano, mes, delta);
  return montarDataIso(alvo.ano, alvo.mes, Math.min(dia, diasNoMes(alvo.ano, alvo.mes)));
}

export function Calendario({
  id,
  hoje,
  valor,
  mesInicial,
  aoEscolher,
  motivo,
  curto,
  invalido,
  descricaoId,
}: {
  id: string;
  hoje: string;
  valor: string;
  // Mês que abre quando não há data escolhida (o da primeira data livre).
  mesInicial: string;
  aoEscolher: (iso: string) => void;
  motivo: (iso: string) => MotivoBloqueio | null;
  curto: (iso: string) => boolean;
  invalido: boolean;
  descricaoId?: string;
}) {
  const primeiro = montarDataIso(mesDe(hoje).ano, mesDe(hoje).mes, 1);
  const ultimo = somarDias(hoje, LIMITE_DIAS_A_FRENTE);
  const [mes, setMes] = useState<Mes>(() => mesDe(valor || mesInicial));
  const [ativo, setAtivo] = useState<string>(() => valor || mesInicial);
  const focarDepois = useRef(false);
  const grade = useRef<HTMLDivElement>(null);

  // A data escolhida mudou por fora (rascunho, outra ação): o calendário vai
  // até ela.
  const [valorVisto, setValorVisto] = useState(valor);
  if (valor !== valorVisto) {
    setValorVisto(valor);
    if (valor) {
      setAtivo(valor);
      setMes(mesDe(valor));
    }
  }

  useEffect(() => {
    if (!focarDepois.current) return;
    focarDepois.current = false;
    grade.current?.querySelector<HTMLButtonElement>('button[tabindex="0"]')?.focus();
  });

  const semanas = gradeDoMes(mes.ano, mes.mes);
  const podeVoltar = antes(mesDe(primeiro), mes);
  const podeAvancar = antes(mes, mesDe(ultimo));
  // O dia que recebe o Tab: o ativo, se estiver neste mês; senão a data
  // escolhida, a primeira livre ou o dia 1.
  const diasDoMes = semanas.flat().filter((c): c is { dia: number; iso: string } => c !== null);
  const tabulavel =
    diasDoMes.find((c) => c.iso === ativo)?.iso ??
    diasDoMes.find((c) => c.iso === valor)?.iso ??
    diasDoMes.find((c) => motivo(c.iso) === null)?.iso ??
    diasDoMes[0].iso;

  function irParaMes(delta: number) {
    const novo = somarMeses(mes.ano, mes.mes, delta);
    setMes(novo);
    setAtivo((atual) => somarUmMes(atual, delta));
  }

  function mover(iso: string) {
    const alvo = iso < primeiro ? primeiro : iso > ultimo ? ultimo : iso;
    setAtivo(alvo);
    const novoMes = mesDe(alvo);
    if (!mesmoMes(novoMes, mes)) setMes(novoMes);
    focarDepois.current = true;
  }

  function aoTeclar(e: KeyboardEvent<HTMLDivElement>) {
    const atual = tabulavel;
    const dia = diaDaSemana(atual);
    const destinos: Record<string, () => string> = {
      ArrowLeft: () => somarDias(atual, -1),
      ArrowRight: () => somarDias(atual, 1),
      ArrowUp: () => somarDias(atual, -7),
      ArrowDown: () => somarDias(atual, 7),
      Home: () => somarDias(atual, -dia),
      End: () => somarDias(atual, 6 - dia),
      PageUp: () => somarUmMes(atual, -1),
      PageDown: () => somarUmMes(atual, 1),
    };
    const destino = destinos[e.key];
    if (!destino) return;
    e.preventDefault();
    mover(destino());
  }

  const tituloId = `${id}-mes`;

  return (
    <div className="checkout-cal" data-invalido={invalido || undefined}>
      <div className="checkout-cal-topo">
        <button
          type="button"
          className="checkout-cal-seta"
          aria-label="Mês anterior"
          disabled={!podeVoltar}
          onClick={() => irParaMes(-1)}
        >
          <Icon name="chevron_left" size={24} tone="inherit" />
        </button>
        <h3 id={tituloId} className="checkout-cal-mes" aria-live="polite">
          {nomeDoMes(mes.mes).replace(/^./, (c) => c.toUpperCase())} de {mes.ano}
        </h3>
        <button
          type="button"
          className="checkout-cal-seta"
          aria-label="Próximo mês"
          disabled={!podeAvancar}
          onClick={() => irParaMes(1)}
        >
          <Icon name="chevron_right" size={24} tone="inherit" />
        </button>
      </div>

      <div
        id={id}
        ref={grade}
        role="grid"
        aria-labelledby={tituloId}
        aria-describedby={descricaoId}
        className="checkout-cal-grade"
        onKeyDown={aoTeclar}
      >
        <div role="row" className="checkout-cal-linha">
          {SEMANA.map((d) => (
            <span key={d.completo} role="columnheader" className="checkout-cal-dia-semana">
              <abbr title={d.completo} aria-label={d.completo}>
                {d.curto}
              </abbr>
            </span>
          ))}
        </div>
        {semanas.map((semana, i) => (
          <div role="row" className="checkout-cal-linha" key={i}>
            {semana.map((casa, j) => {
              if (!casa) return <span role="gridcell" key={j} className="checkout-cal-vazio" />;
              const bloqueio = motivo(casa.iso);
              const escolhida = casa.iso === valor;
              const passado = casa.iso <= hoje;
              const marcaCurta = !bloqueio && curto(casa.iso);
              const estado = escolhida ? "escolhida" : bloqueio ? (passado || bloqueio === "antecedencia" ? "passado" : "bloqueada") : "livre";
              const sufixo = bloqueio
                ? `, indisponível: ${TEXTO_MOTIVO[bloqueio]}`
                : marcaCurta
                  ? ", prazo curto"
                  : "";
              return (
                <span role="gridcell" key={j} aria-selected={escolhida}>
                  <button
                    type="button"
                    className="checkout-cal-dia"
                    data-estado={estado}
                    data-curto={marcaCurta || undefined}
                    tabIndex={casa.iso === tabulavel ? 0 : -1}
                    aria-disabled={bloqueio ? true : undefined}
                    aria-pressed={escolhida}
                    aria-label={`${dataCompleta(casa.iso)}${sufixo}`}
                    onClick={() => {
                      setAtivo(casa.iso);
                      if (!bloqueio) aoEscolher(casa.iso);
                    }}
                  >
                    {casa.dia}
                  </button>
                </span>
              );
            })}
          </div>
        ))}
      </div>

      <ul className="checkout-cal-legenda" aria-label="Legenda do calendário">
        <li>
          <span className="checkout-cal-amostra" data-estado="escolhida" aria-hidden="true" />
          Escolhida
        </li>
        <li>
          <span className="checkout-cal-amostra" data-estado="livre" aria-hidden="true" />
          Disponível
        </li>
        <li>
          <span className="checkout-cal-amostra" data-estado="livre" data-curto aria-hidden="true" />
          Prazo curto
        </li>
        <li>
          <span className="checkout-cal-amostra" data-estado="bloqueada" aria-hidden="true" />
          Segunda ou fora do prazo
        </li>
      </ul>
    </div>
  );
}
