"use client";

import { useActionState, useState } from "react";
import { login, type LoginState } from "./actions";
import { TurnstileWidget } from "./turnstile-widget";
import { Field, Input, Button } from "@/components/ds";

const initialState: LoginState = {};

export function LoginForm({ siteKey }: { siteKey: string }) {
  const [state, formAction, pending] = useActionState(login, initialState);
  const [turnstileToken, setTurnstileToken] = useState("");

  return (
    <form action={formAction} className="login-form" style={{ display: "grid" }}>
      <Field label="E-mail" htmlFor="login-email">
        <Input
          id="login-email"
          name="email"
          type="email"
          icon="mail"
          placeholder="voce@pingodemell.com.br"
          autoComplete="username"
          required
        />
      </Field>

      <Field label="Senha" htmlFor="login-senha">
        <Input
          id="login-senha"
          name="password"
          type="password"
          icon="lock"
          placeholder="Sua senha"
          autoComplete="current-password"
          required
        />
      </Field>

      <input type="hidden" name="turnstileToken" value={turnstileToken} />
      <TurnstileWidget siteKey={siteKey} onToken={setTurnstileToken} />

      {state?.error && (
        <p role="alert" aria-live="polite" style={{ margin: 0, fontSize: "var(--fs-small)", color: "var(--pdm-error)" }}>
          {state.error}
        </p>
      )}

      <Button type="submit" fullWidth iconRight="arrow_forward" disabled={pending || !turnstileToken}>
        {pending ? "Entrando…" : "Entrar no painel"}
      </Button>
    </form>
  );
}
