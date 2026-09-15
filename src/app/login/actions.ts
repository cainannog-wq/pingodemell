"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = {
  error?: string;
};

export async function login(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const turnstileToken = String(formData.get("turnstileToken") ?? "");

  if (!email || !password) {
    return { error: "Preencha e-mail e senha." };
  }

  if (!turnstileToken) {
    return { error: "Confirme a verificação de segurança antes de entrar." };
  }

  const supabase = await createClient();
  // O token do Turnstile é verificado pelo próprio Supabase Auth (captcha
  // protection configurada no projeto) — um único uso do token, aqui.
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
    options: { captchaToken: turnstileToken },
  });

  if (error) {
    if (error.message.toLowerCase().includes("captcha")) {
      return {
        error: "Verificação de segurança falhou. Recarregue a página e tente de novo.",
      };
    }
    return { error: "E-mail ou senha inválidos." };
  }

  redirect("/admin/produtos");
}
