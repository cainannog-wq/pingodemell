import type { NextConfig } from "next";
import { NOINDEX, ROTAS_SEMPRE_NOINDEX, SITE_INDEXAVEL, cabecalhoRobots } from "./src/lib/site/indexacao";

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
    // Contexto do deploy na Netlify, fixado no build (src/lib/pedidos/ambiente.ts):
    // "production" grava pedido de verdade; qualquer outro valor (ou vazio)
    // grava o pedido marcado como teste e usa o interruptor "fora_producao".
    CONTEXTO_NETLIFY: process.env.CONTEXT ?? "",
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
    // Fora dos buscadores (src/lib/site/indexacao.ts): o site inteiro, em
    // qualquer domínio, enquanto SITE_INDEXAVEL for false (até o corte de
    // DNS); a homologação (branch deploy da Netlify), sempre. CONTEXT é
    // definido pela Netlify no build ("production", "deploy-preview",
    // "branch-deploy").
    const robots = cabecalhoRobots(SITE_INDEXAVEL, process.env.CONTEXT);
    if (robots) headers.push({ key: "X-Robots-Tag", value: robots });
    if (process.env.CONTEXT === "branch-deploy") {
      // Commit que a homologação está servindo (COMMIT_REF é definido pela
      // Netlify no build): prova "homologação = commit X" com um curl -I,
      // sem abrir o painel. Só na homologação.
      if (process.env.COMMIT_REF) headers.push({ key: "X-Homologacao-Commit", value: process.env.COMMIT_REF });
    }
    // Admin, login e API ficam fora dos buscadores sempre, com a trava em
    // qualquer valor e em qualquer contexto (PR fase4/indexacao-correcoes).
    return [
      { source: "/:path*", headers },
      ...ROTAS_SEMPRE_NOINDEX.map((source) => ({ source, headers: [{ key: "X-Robots-Tag", value: NOINDEX }] })),
    ];
  },
};

export default nextConfig;
