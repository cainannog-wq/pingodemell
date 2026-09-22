"use client";

import { useState } from "react";
import { Input } from "./Input";

// Máscara de moeda (dígitos = centavos, como caixa eletrônico): exibe
// "R$ 1.234,56" enquanto digita, mas manda pro FormData um campo oculto
// com valor decimal simples ("1234.56"), sem separador de milhar, pra
// parseProdutoForm não precisar adivinhar o formato.
function formatCentsToDisplay(cents: number): string {
  const value = cents / 100;
  const [intPart, decPart] = value.toFixed(2).split(".");
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${withThousands},${decPart}`;
}

function centsToDecimalString(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function PriceInput({
  id,
  name,
  defaultValue,
  required,
}: {
  id?: string;
  name: string;
  defaultValue?: number;
  required?: boolean;
}) {
  const [cents, setCents] = useState(() => Math.max(0, Math.round((defaultValue ?? 0) * 100)));

  return (
    <>
      <input type="hidden" name={name} value={centsToDecimalString(cents)} />
      <Input
        id={id}
        inputMode="decimal"
        placeholder="R$ 0,00"
        value={cents > 0 ? formatCentsToDisplay(cents) : ""}
        required={required}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "");
          setCents(digits ? Number(digits) : 0);
        }}
      />
    </>
  );
}
