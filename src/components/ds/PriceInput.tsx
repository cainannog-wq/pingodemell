"use client";

import { useLayoutEffect, useRef, useState } from "react";
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

// Conta quantos dígitos existem antes de `position` em `value` — usado
// pra saber "onde" o usuário estava editando em termos de dígitos, não de
// posição de caractere (que muda a cada tecla por causa de "R$ ", pontos
// de milhar e vírgula sendo inseridos/removidos ao redor dos dígitos).
function countDigitsBefore(value: string, position: number): number {
  let count = 0;
  for (let i = 0; i < position && i < value.length; i++) {
    if (/\d/.test(value[i])) count++;
  }
  return count;
}

// Inverso de countDigitsBefore: acha a posição de caractere logo depois
// do N-ésimo dígito na string já formatada, pra recolocar o cursor no
// mesmo lugar "relativo aos dígitos" depois da reformatação. Com 0
// dígitos antes do cursor, o cursor vai pra logo antes do primeiro
// dígito (não pra posição 0 crua), pra não pular pra antes do "R$ ".
function positionAfterDigits(value: string, digitCount: number): number {
  if (digitCount <= 0) {
    const firstDigitIndex = value.search(/\d/);
    return firstDigitIndex === -1 ? value.length : firstDigitIndex;
  }
  let seen = 0;
  for (let i = 0; i < value.length; i++) {
    if (/\d/.test(value[i])) {
      seen++;
      if (seen === digitCount) return i + 1;
    }
  }
  return value.length;
}

// Limitação conhecida: abaixo de R$ 1,00 o valor formatado ganha dígitos
// "0" sintéticos (padding do centavo/inteiro) que não vieram da digitação
// — nesse caso estreito (valor total < 3 dígitos) o cursor pode ficar
// levemente deslocado do dígito exato digitado, mas nunca pula pro fim
// da string, que era o bug original.
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
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingCaretDigitsRef = useRef<number | null>(null);

  // Corrige o cursor pulando pro fim ao editar uma posição no meio do
  // valor (achado da auditoria de acessibilidade de 22/09/2026): a cada
  // tecla o React troca o `value` inteiro (recalculado do zero), e sem
  // isso o navegador reposiciona o cursor no fim por padrão.
  useLayoutEffect(() => {
    const digitCount = pendingCaretDigitsRef.current;
    const el = inputRef.current;
    if (digitCount === null || !el) return;
    const display = cents > 0 ? formatCentsToDisplay(cents) : "";
    const pos = positionAfterDigits(display, digitCount);
    el.setSelectionRange(pos, pos);
    pendingCaretDigitsRef.current = null;
  }, [cents]);

  return (
    <>
      <input type="hidden" name={name} value={centsToDecimalString(cents)} />
      <Input
        ref={inputRef}
        id={id}
        inputMode="decimal"
        placeholder="R$ 0,00"
        value={cents > 0 ? formatCentsToDisplay(cents) : ""}
        required={required}
        onChange={(e) => {
          const caretPos = e.target.selectionStart ?? e.target.value.length;
          pendingCaretDigitsRef.current = countDigitsBefore(e.target.value, caretPos);
          const digits = e.target.value.replace(/\D/g, "");
          setCents(digits ? Number(digits) : 0);
        }}
      />
    </>
  );
}
