-- Desfaz supabase/produtos-categoria-obrigatoria.sql: "Categoria" volta a
-- aceitar vazio. Nenhuma linha de produtos é tocada.
--
-- NÃO-ADITIVA. Só roda com o ok do Cainan, a menos que o admin ou o site
-- de produção estejam quebrados pela categoria obrigatória.
--
-- Sem begin/commit (quem aplica abre a transação; ver o cabeçalho da
-- migração). Provado numa transação desfeita por scripts/banco/categoria.mjs.

set local lock_timeout = '2s';

alter table public.produtos alter column "Categoria" drop not null;
