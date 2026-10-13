-- Desfaz supabase/categoria-kit-festa.sql: 'Kit Festa' volta a ser 'Kits'.
-- Só com ok do Cainan, ou na hora, se o RENAME causar problema em produção.
-- Sem begin/commit próprios (ver categoria-kit-festa.sql).
-- Não reescreve linhas nem muda atualizado_em. Depois de rodar, limpar o
-- cache da vitrine (ver docs/status-pingo-de-mell.md).

set local lock_timeout = '2s';
set local statement_timeout = '10s';

do $$
begin
  if not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'categoria_produto' and e.enumlabel = 'Kit Festa'
  ) then
    raise exception 'categoria_produto não tem o valor Kit Festa: nada a desfazer';
  end if;
  if exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'categoria_produto' and e.enumlabel = 'Kits'
  ) then
    raise exception 'categoria_produto já tem o valor Kits';
  end if;
end $$;

alter type public.categoria_produto rename value 'Kit Festa' to 'Kits';
