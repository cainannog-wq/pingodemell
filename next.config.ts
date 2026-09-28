import type { NextConfig } from "next";

const supabaseHostname = process.env.SUPABASE_URL
  ? new URL(process.env.SUPABASE_URL).hostname
  : undefined;

const nextConfig: NextConfig = {
  // Expõe estas variáveis também no bundle do navegador, mantendo os nomes
  // sem o prefixo NEXT_PUBLIC_ (a anon key do Supabase e a site key do
  // Turnstile são públicas por design).
  env: {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    TURNSTILE_SITE_KEY: process.env.TURNSTILE_SITE_KEY,
    // Registro de tempo do Salvar no console (src/lib/admin/tempos.ts): "1"
    // só no build da homologação (branch deploy da Netlify). Na produção
    // fica vazio e o build elimina o código do registro.
    MEDIR_TEMPOS_ADMIN: process.env.CONTEXT === "branch-deploy" ? "1" : "",
  },
  images: {
    remotePatterns: supabaseHostname
      ? [
          {
            protocol: "https",
            hostname: supabaseHostname,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
  },
  // Cabecalhos de seguranca (auditoria de 14/09/2026, item B20). Declarados
  // aqui, nao em netlify.toml: o @netlify/plugin-nextjs nao repassa o bloco
  // [[headers]] do netlify.toml pras respostas renderizadas pelo Next
  // (confirmado testando contra o deploy real) — headers() do proprio
  // Next.js e o mecanismo que o plugin de fato honra.
  //
  // Sem CSP explicita ainda: o projeto ainda vai ganhar GA4/Clarity na
  // Fase 4 do roadmap, e definir CSP antes disso so pra refazer depois nao
  // vale a pena — revisitar quando essas tags entrarem.
  async headers() {
    const headers = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ];
    // Homologação (branch deploy da Netlify, homologacao--pingodemell.netlify.app)
    // fora do Google. A Netlify já põe noindex nos Deploy Previews e nos links
    // fixos de deploy, mas não no endereço da branch. CONTEXT é definido pela
    // Netlify no build ("production", "deploy-preview", "branch-deploy"); a
    // produção nunca recebe este cabeçalho.
    if (process.env.CONTEXT === "branch-deploy") {
      headers.push({ key: "X-Robots-Tag", value: "noindex, nofollow" });
      // Commit que a homologação está servindo (COMMIT_REF é definido pela
      // Netlify no build): prova "homologação = commit X" com um curl -I,
      // sem abrir o painel. Só na homologação.
      if (process.env.COMMIT_REF) headers.push({ key: "X-Homologacao-Commit", value: process.env.COMMIT_REF });
    }
    return [{ source: "/:path*", headers }];
  },
};

export default nextConfig;
