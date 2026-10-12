"use client";

import { useSyncExternalStore } from "react";

// Mesmo corte do CSS da interna (interna.css, `@media (max-width: 767px)`):
// abaixo disso a barra fixa do rodapé vira o lugar do seletor. No servidor e
// antes de hidratar vale "não é celular" (a página sai com o seletor no
// corpo e, no celular, ele passa para a barra ao montar). Sem matchMedia
// (testes em jsdom) também vale "não é celular".
const CONSULTA = "(max-width: 767px)";

function assinar(aviso: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const lista = window.matchMedia(CONSULTA);
  lista.addEventListener("change", aviso);
  return () => lista.removeEventListener("change", aviso);
}

function lerAgora() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(CONSULTA).matches;
}

export function useCelular(): boolean {
  return useSyncExternalStore(assinar, lerAgora, () => false);
}
