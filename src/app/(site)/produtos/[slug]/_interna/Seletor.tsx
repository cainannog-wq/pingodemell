"use client";

import { Icon } from "@/components/ds";

// Seletor em pílula do layout (− valor +), usado na quantidade do avulso,
// no número de centos e em cada sabor do Cento. Os botões têm 44px de
// altura (alvo de toque) e rótulo para leitor de tela; o valor é anunciado
// quando muda (aria-live). Com `aoDigitar`, o valor vira um campo de texto
// numérico (quantidade do avulso: pedir 150 brigadeiros clicando de 1 em 1
// não dá).
export function Seletor({
  rotulo,
  valor,
  aoMenos,
  aoMais,
  podeMenos,
  podeMais,
  aoDigitar,
  aoSairDoCampo,
  invalido = false,
  apagado = false,
  idCampo,
}: {
  // Nome do que está sendo contado ("Quantidade", "Brigadeiro Gourmet").
  rotulo: string;
  valor: number | string;
  aoMenos: () => void;
  aoMais: () => void;
  podeMenos: boolean;
  podeMais: boolean;
  aoDigitar?: (texto: string) => void;
  aoSairDoCampo?: () => void;
  invalido?: boolean;
  // Sabor zerado: pílula e número mais claros, como no layout.
  apagado?: boolean;
  idCampo?: string;
}) {
  return (
    <div className="interna-seletor" data-apagado={apagado} data-invalido={invalido}>
      <button type="button" className="interna-seletor-btn" aria-label={`Diminuir ${rotulo}`} disabled={!podeMenos} onClick={aoMenos}>
        <Icon name="remove" size={20} tone="inherit" />
      </button>
      {aoDigitar ? (
        <input
          id={idCampo}
          className="interna-seletor-valor"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          aria-label={rotulo}
          aria-invalid={invalido || undefined}
          value={valor}
          onChange={(e) => aoDigitar(e.target.value.replace(/\D/g, "").slice(0, 5))}
          onBlur={aoSairDoCampo}
        />
      ) : (
        <span className="interna-seletor-valor" aria-live="polite">
          <span className="site-visually-hidden">{rotulo}: </span>
          {valor}
        </span>
      )}
      <button type="button" className="interna-seletor-btn" aria-label={`Aumentar ${rotulo}`} disabled={!podeMais} onClick={aoMais}>
        <Icon name="add" size={20} tone="inherit" />
      </button>
    </div>
  );
}
