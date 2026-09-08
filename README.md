# Pingo de Mel

Base técnica do projeto: Next.js (App Router, TypeScript) + Supabase.

Stack de destino: **Netlify** (hospedagem) + **Supabase** (banco, storage e autenticação).

## Configuração

1. Copie `.env.example` para `.env.local` e preencha com os dados do seu projeto Supabase:

   ```bash
   SUPABASE_URL=
   SUPABASE_ANON_KEY=
   ```

2. Instale as dependências e rode localmente:

   ```bash
   npm install
   npm run dev
   ```

   Abra [http://localhost:3000](http://localhost:3000).

## Cliente Supabase

- [`src/lib/supabase/client.ts`](src/lib/supabase/client.ts) — cliente para Client Components (`"use client"`).
- [`src/lib/supabase/server.ts`](src/lib/supabase/server.ts) — cliente para Server Components, Server Actions e Route Handlers (usa cookies da requisição).
- [`src/lib/supabase/env.ts`](src/lib/supabase/env.ts) — leitura e validação de `SUPABASE_URL` / `SUPABASE_ANON_KEY`.

As variáveis são expostas ao navegador via `env` em [`next.config.ts`](next.config.ts), sem precisar do prefixo `NEXT_PUBLIC_` (a anon key do Supabase é uma chave pública/publishable por design).

## Deploy (Netlify)

O build é gerenciado pelo plugin oficial `@netlify/plugin-nextjs` (ver [`netlify.toml`](netlify.toml)). No painel do Netlify, configure as mesmas variáveis de ambiente (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) em Site settings → Environment variables.
