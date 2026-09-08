import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Expõe estas variáveis também no bundle do navegador, mantendo os nomes
  // sem o prefixo NEXT_PUBLIC_ (a anon key do Supabase é pública por design).
  env: {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  },
};

export default nextConfig;
