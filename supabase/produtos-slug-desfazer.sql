-- Desfaz a etapa 1 do slug (supabase/produtos-slug.sql), na ordem:
-- gatilhos, funções, restrições e coluna. Os slugs gravados se perdem; o
-- resto de cada produto (inclusive atualizado_em) não é tocado.
--
-- Só roda com o ok do Cainan, a menos que o admin ou o site de produção
-- estejam quebrados pela etapa 1. Depois da etapa 2 não vale mais como
-- está (a coluna já seria obrigatória e o código já dependeria dela).
-- A etapa 2 foi aplicada em 02/10/2026: desfazê-la antes, com
-- supabase/produtos-slug-obrigatorio-desfazer.sql.
--
-- Sem begin/commit (quem aplica abre a transação). Provado numa transação
-- desfeita por scripts/banco/slug-migracao.mjs (banco igual ao de antes),
-- só enquanto a etapa 2 não estava aplicada.

set local lock_timeout = '2s';

drop trigger produtos_slug_imutavel on public.produtos;
drop trigger produtos_slug_no_cadastro on public.produtos;

drop function public.produtos_slug_imutavel();
drop function public.produtos_slug_no_cadastro();
drop function public.produto_slug_livre(text);
drop function public.produto_slug_base(text);

alter table public.produtos drop constraint produtos_slug_key;
alter table public.produtos drop constraint produtos_slug_formato;

alter table public.produtos drop column slug;
