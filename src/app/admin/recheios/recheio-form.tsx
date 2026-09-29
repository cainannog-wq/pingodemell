"use client";

import Link from "next/link";
import { startTransition, useActionState, useState, type FormEvent } from "react";
import { Button, Card, Field, Icon, Input, PriceInput, Select, Toggle } from "@/components/ds";
import { GRUPO_RECHEIO_LABELS, GRUPO_RECHEIO_VALUES, NOME_RECHEIO_MAX, type Recheio } from "@/lib/recheios/types";
import type { RecheioFormState } from "./actions";

type Acao = (prev: RecheioFormState, formData: FormData) => Promise<RecheioFormState>;

const estadoInicial: RecheioFormState = {};

// Cadastro e edição de recheio. Preço por kg e grupo só existem para o
// recheio que vale no Bolo grande: aparecem (e são exigidos) só com "Bolo
// grande" marcado. Para o Bento Cake o recheio é informativo, sem preço.
export function RecheioForm({ action, recheio, rotuloEnviar }: { action: Acao; recheio?: Recheio; rotuloEnviar: string }) {
  const [state, formAction, pending] = useActionState(action, estadoInicial);
  const [valeBolo, setValeBolo] = useState(recheio?.vale_bolo ?? false);

  // Envio por onSubmit (e não <form action>): o React 19 limpa o formulário
  // depois de uma ação, e um erro do servidor apagaria tudo o que foi digitado.
  function aoEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    startTransition(() => formAction(dados));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {state?.error && (
        <div
          role="alert"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            background: "var(--pdm-cream-warm)",
            borderRadius: "var(--radius)",
            boxShadow: "var(--shadow-rest)",
            padding: "16px 24px",
            color: "var(--pdm-error)",
          }}
        >
          <Icon name="error" size={24} tone="inherit" />
          <span>{state.error}</span>
        </div>
      )}

      <form onSubmit={aoEnviar}>
        <Card tone="white" padding="0">
          <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 24, borderBottom: "1px solid var(--border-subtle)" }}>
            <Field label="Nome do recheio" htmlFor="r-nome" required hint="Como o cliente vai ver. Um recheio que serve para bolo e para bento é cadastrado uma vez só.">
              <Input id="r-nome" name="nome" defaultValue={recheio?.nome} maxLength={NOME_RECHEIO_MAX} placeholder="Ex.: Brigadeiro" required />
            </Field>

            <Field label="Onde o recheio vale" hint="Marque um ou os dois.">
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <Toggle name="vale_bolo" checked={valeBolo} onCheckedChange={setValeBolo} label="Bolo grande (com preço por kg)" />
                <Toggle name="vale_bento" defaultChecked={recheio?.vale_bento ?? false} label="Bento Cake (só informativo, sem preço)" />
              </div>
            </Field>

            {valeBolo && (
              <div className="produto-form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
                <Field label="Preço por kg" htmlFor="r-preco" required hint="Preço do bolo = preço por kg deste recheio × tamanho em kg.">
                  <PriceInput id="r-preco" name="preco_kg" defaultValue={recheio?.preco_kg ?? undefined} required />
                </Field>
                <Field label="Grupo" htmlFor="r-grupo" required hint="Como o recheio aparece agrupado na tela do Bolo.">
                  <Select id="r-grupo" name="grupo" defaultValue={recheio?.grupo ?? ""} required>
                    <option value="" disabled>
                      Selecione o grupo
                    </option>
                    {GRUPO_RECHEIO_VALUES.map((g) => (
                      <option key={g} value={g}>
                        {GRUPO_RECHEIO_LABELS[g]}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            )}

            <Field label="Status do recheio" hint="Recheio desativado some das telas do cliente, mas continua aqui. Nunca é apagado.">
              <Toggle name="ativo" defaultChecked={recheio?.ativo ?? true} label="Recheio ativo" />
            </Field>
          </div>

          <div
            style={{
              padding: 24,
              background: "var(--pdm-cream)",
              display: "flex",
              alignItems: "center",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <Button type="submit" iconLeft="check" disabled={pending}>
              {pending ? "Salvando…" : rotuloEnviar}
            </Button>
            <Link href="/admin/recheios">
              <Button type="button" variant="secondary">
                Cancelar
              </Button>
            </Link>
          </div>
        </Card>
      </form>
    </div>
  );
}
