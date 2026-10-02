import { useSyncExternalStore } from "react";

// Verdadeiro só depois de montar no navegador. No servidor (e no primeiro
// render do cliente, antes de hidratar) o carrinho é sempre vazio, então quem
// mostra algo que depende dele espera este sinal: as duas coisas viram juntas.
const assinarNada = () => () => {};
const lerMontado = () => true;
const lerMontadoNoServidor = () => false;

export function useMontado(): boolean {
  return useSyncExternalStore(assinarNada, lerMontado, lerMontadoNoServidor);
}
