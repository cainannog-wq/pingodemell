-- Desfaz supabase/produtos-categoria-obrigatoria.sql: "Categoria" volta a
-- aceitar vazio. Nenhuma linha de produtos é tocada.
--
-- NÃO-ADITIVA. Só roda com o ok do Cainan, a menos que o admin ou o site
-- de produção estejam quebrados pela categoria obrigatória.
--
-- RODAR DENTRO DE BEGIN E COMMIT: no editor SQL, escrever "begin;" antes
-- do conteúdo deste arquivo e "commit;" depois (o apply_migration da
-- Supabase já abre a transação sozinho). O set local abaixo só vale dentro
-- da transação. O arquivo não traz begin/commit próprios: eles fariam o
-- --com-migracao dos testes gravar em produção (o rodarMigracao de
-- scripts/banco/lib.mjs recusa). Provado numa transação desfeita por
-- scripts/banco/categoria.mjs.

set local lock_timeout = '2s';

alter table public.produtos alter column "Categoria" drop not null;
