import Image from "next/image";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/supabase/dal";
import { Card } from "@/components/ds";
import { LoginForm } from "./login-form";
import "./login.css";

export default async function LoginPage() {
  const user = await getAuthenticatedUser();
  if (user) {
    redirect("/admin/produtos");
  }

  const siteKey = process.env.TURNSTILE_SITE_KEY;
  if (!siteKey) {
    throw new Error("Missing environment variable: TURNSTILE_SITE_KEY");
  }

  return (
    <div
      style={{
        fontFamily: "var(--font-body)",
        color: "var(--pdm-black)",
        background: "var(--pdm-cream)",
        fontSize: "16px",
        lineHeight: 1.6,
        minHeight: "100dvh",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
      }}
    >
      <div
        className="login-brand-panel"
        style={{
          background: "var(--gradient-brand)",
          color: "var(--pdm-white)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <Image src="/logo-mono-cream.png" alt="Pingo de Mell" width={200} height={102} style={{ width: 200, height: "auto", display: "block" }} priority />
        <div>
          <h1
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: 40,
              lineHeight: 1.3,
              margin: 0,
              color: "var(--pdm-white)",
              maxWidth: "16ch",
            }}
          >
            O seu cardápio, sempre no ponto.
          </h1>
          <p style={{ fontSize: 18, color: "rgba(255,255,255,.92)", maxWidth: "36ch", margin: "16px 0 0" }}>
            Cadastre bolos, doces e salgados e mantenha preço, descrição e quantidade mínima sempre atualizados.
          </p>
        </div>
        <div className="login-tagline" style={{ fontSize: 14, color: "rgba(255,255,255,.92)" }}>
          Área da equipe · há 13 anos fazendo festa acontecer
        </div>
      </div>

      <div className="login-form-panel" style={{ display: "grid", placeItems: "center" }}>
        <div style={{ width: "100%", maxWidth: 420 }}>
          <Card tone="white" padding="32px" className="login-card">
            <h2 className="login-card-title" style={{ fontFamily: "var(--font-heading)", lineHeight: 1.3, margin: 0, color: "var(--pdm-brown)" }}>
              Bem-vinda de volta
            </h2>
            <p style={{ margin: "8px 0 0", color: "var(--pdm-muted)" }}>
              Entre com o e-mail cadastrado para abrir o painel.
            </p>
            <LoginForm siteKey={siteKey} />
          </Card>
          <p style={{ fontSize: 14, color: "var(--pdm-muted)", margin: "24px 0 0" }}>
            Esqueceu a senha? Chame o responsável técnico que ele reenvia o acesso 💛
          </p>
        </div>
      </div>
    </div>
  );
}
