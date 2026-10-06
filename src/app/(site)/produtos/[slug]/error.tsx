"use client";

import { Icon } from "@/components/ds";
import "./interna.css";

// Aviso de falha da interna (PR perf/vitrine-consultas-cache). A página fica
// em cache e, numa falha do banco, lança erro em vez de montar o aviso: o
// Next continua servindo a versão anterior guardada. Este aviso só aparece
// quando não há nenhuma versão guardada (primeira geração da página). Mesma
// marcação e mesma frase do aviso que a página mostrava antes.
export default function ErroDaInterna() {
  return (
    <div className="site-container interna-falha">
      <div className="lista-aviso">
        <Icon name="error" size={28} tone="accent" />
        <p>Não conseguimos carregar este produto agora. Tente de novo em alguns instantes.</p>
      </div>
    </div>
  );
}
