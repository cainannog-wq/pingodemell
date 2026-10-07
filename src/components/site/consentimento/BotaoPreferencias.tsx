"use client";

import { Button } from "@/components/ds";
import { useConsentimentoSeHouver } from "./ConsentimentoProvider";

// "Preferências de privacidade" na seção 8 da Política (desde o PR de
// ajustes visuais de 07/10/2026; antes ficava no rodapé): reabre o banner
// de consentimento. Só existe com ID do GA4 efetivo, depois de montar, e
// em nenhum outro lugar do site. Ao escolher no banner, o foco volta para cá.
export function BotaoPreferencias() {
  const consentimento = useConsentimentoSeHouver();
  if (!consentimento?.id) return null;
  const { reabrir } = consentimento;
  return (
    <div className="politica-preferencias">
      <Button type="button" variant="secondary" size="md" onClick={(e) => reabrir(e.currentTarget)}>
        Preferências de privacidade
      </Button>
    </div>
  );
}
