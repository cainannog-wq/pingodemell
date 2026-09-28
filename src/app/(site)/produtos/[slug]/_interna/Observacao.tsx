"use client";

import { Field, Textarea } from "@/components/ds";
import { OBSERVACAO_MAX } from "@/lib/carrinho/regras";

// Observação do item (opcional, texto livre). Vai na linha do carrinho,
// junto do item, para a mensagem do WhatsApp e o registro do pedido. É
// diferente das observações do pedido inteiro, no checkout.
export function Observacao({
  id,
  valor,
  aoMudar,
  exemplo,
}: {
  id: string;
  valor: string;
  aoMudar: (texto: string) => void;
  exemplo: string;
}) {
  return (
    <Field label="Alguma observação? (opcional)" htmlFor={id} hint="Escreva do jeito que você contaria pra gente.">
      <Textarea id={id} rows={3} maxLength={OBSERVACAO_MAX} placeholder={exemplo} value={valor} onChange={(e) => aoMudar(e.target.value)} />
    </Field>
  );
}
