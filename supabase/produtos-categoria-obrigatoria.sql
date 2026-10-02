-- Categoria do produto obrigatória no banco ("Categoria", enum
-- categoria_produto, 6 valores: Bolos, Doces, Salgados, Bebidas, Kits,
-- Bento Cake). O formulário do admin (parseProdutoForm) já exige a
-- categoria desde o PR #20 (2d); aqui o banco passa a exigir também.
--
-- NÃO-ADITIVA (NOT NULL em tabela que já tem linhas). Só vai a produção
-- depois do merge do PR, com o ok explícito do Cainan. Antes, a conferência
-- abaixo cancela tudo se existir produto sem categoria.
--
-- Sem begin/commit, como supabase/produtos-slug-obrigatorio.sql: quem
-- aplica abre a transação (o apply_migration da Supabase já roda numa; no
-- editor SQL, envolver em begin/commit), e o set local abaixo só vale
-- dentro dela. begin/commit próprios fariam o --com-migracao dos testes
-- gravar em produção (o rodarMigracao de scripts/banco/lib.mjs recusa).
-- Prova antes de aplicar:
--   node scripts/banco/rodar-todos.mjs --com-migracao=supabase/produtos-categoria-obrigatoria.sql
-- (scripts/banco/categoria.mjs). Desfazer: supabase/produtos-categoria-desfazer.sql.

set local lock_timeout = '2s';

do $$
begin
  if exists (select 1 from public.produtos where "Categoria" is null) then
    raise exception 'Categoria obrigatória cancelada: existe produto sem categoria.';
  end if;
end;
$$;

alter table public.produtos alter column "Categoria" set not null;
