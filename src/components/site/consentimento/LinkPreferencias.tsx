"use client";

import { useConsentimentoSeHouver } from "./ConsentimentoProvider";

// "Preferências de privacidade" no rodapé (PR 2 da Fase 4): reabre o
// banner de consentimento. Só existe com ID do GA4 efetivo, depois de
// montar. É um botão (abre algo na página), com a aparência dos links do
// rodapé; ao escolher no banner, o foco volta para cá.
export function LinkPreferencias() {
  const consentimento = useConsentimentoSeHouver();
  if (!consentimento?.id) return null;
  const { reabrir } = consentimento;
  return (
    <button type="button" className="site-footer-preferencias" onClick={(e) => reabrir(e.currentTarget)}>
      Preferências de privacidade
    </button>
  );
}
