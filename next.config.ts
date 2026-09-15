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
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
