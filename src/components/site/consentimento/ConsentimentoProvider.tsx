"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useMontado } from "@/components/site/useMontado";
import { revogar } from "@/lib/analitica/gtag";
import { lerIdGa4 } from "@/lib/analitica/id";
import {
  assinarConsentimento,
  gravarConsentimento,
  lerConsentimento,
  lerConsentimentoNoServidor,
  type Consentimento,
  type Escolha,
} from "@/lib/consentimento/consentimento";

// Estado do consentimento no site público (PR 2 da Fase 4), dividido entre
// o banner, o botão "Preferências de privacidade" da Política e, a partir da
// etapa da medição, a etiqueta do GA4.
//
// - id: o ID do GA4 efetivo, lido só depois de montar (src/lib/analitica/
//   id.ts). Nulo: não existe banner nem link.
// - aberto: o banner na tela. Sem escolha válida, sempre; com escolha, só
//   depois de reaberto pelo rodapé.
// - reaberto: o banner foi reaberto pelo rodapé. Mostra a escolha atual e,
//   ao escolher, devolve o foco ao link.

type Contexto = {
  id: string | null;
  consentimento: Consentimento | null;
  aberto: boolean;
  reaberto: boolean;
  reabrir: (quem: HTMLElement | null) => void;
  escolher: (escolha: Escolha) => void;
};

const ContextoConsentimento = createContext<Contexto | null>(null);

export function ConsentimentoProvider({ children }: { children: ReactNode }) {
  const montado = useMontado();
  const consentimento = useSyncExternalStore(assinarConsentimento, lerConsentimento, lerConsentimentoNoServidor);
  const id = montado ? lerIdGa4() : null;
  const [reaberto, setReaberto] = useState(false);
  const quemReabriu = useRef<HTMLElement | null>(null);

  const aberto = id !== null && (consentimento === null || reaberto);

  const reabrir = useCallback((quem: HTMLElement | null) => {
    quemReabriu.current = quem;
    setReaberto(true);
  }, []);

  const escolher = useCallback(
    (escolha: Escolha) => {
      const anterior = consentimento?.escolha;
      gravarConsentimento(escolha);
      // Revogar (recusar depois de ter aceitado): desliga o envio, apaga os
      // cookies _ga e recarrega a página, já sem GA4.
      if (anterior === "aceito" && escolha === "recusado" && id) {
        revogar(id);
        return;
      }
      if (reaberto) {
        setReaberto(false);
        // O foco volta ao link do rodapé (o banner some em seguida).
        quemReabriu.current?.focus();
      }
    },
    [reaberto, consentimento, id]
  );

  const valor = useMemo(
    () => ({ id, consentimento, aberto, reaberto, reabrir, escolher }),
    [id, consentimento, aberto, reaberto, reabrir, escolher]
  );
  return <ContextoConsentimento.Provider value={valor}>{children}</ContextoConsentimento.Provider>;
}

// Fora do provider (rodapé renderizado sozinho, em teste): nulo.
export function useConsentimentoSeHouver(): Contexto | null {
  return useContext(ContextoConsentimento);
}

export function useConsentimento(): Contexto {
  const valor = useContext(ContextoConsentimento);
  if (!valor) throw new Error("useConsentimento fora do ConsentimentoProvider");
  return valor;
}
