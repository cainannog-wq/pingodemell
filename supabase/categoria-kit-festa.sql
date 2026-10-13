-- Renomeia o valor 'Kits' do enum categoria_produto para 'Kit Festa'
-- (PR categoria/kit-festa, pedido da Taami, 12/10/2026).
--
-- Categoria: NÃO-ADITIVA (muda o nome de um valor de enum em uso). Pela regra
-- do CLAUDE.md só vai a produção DEPOIS do merge do PR, com ok escrito do
-- Cainan. O código do PR já reconhece "Kits" e "Kit Festa" como a mesma
-- categoria, então o site funciona antes e depois deste arquivo.
--
-- O RENAME VALUE só muda o rótulo no catálogo do Postgres: não reescreve
-- nenhuma linha, nenhum gatilho dispara e produtos.atualizado_em fica
-- intacto. A coluna "Categoria" continua apontando para o mesmo valor.
--
-- Sem begin/commit próprios (o apply_migration da Supabase já abre a
-- transação; scripts/banco/lib.mjs recusa arquivo com begin/commit).
-- Desfazer: supabase/categoria-kit-festa-desfazer.sql.
-- Depois de aplicar (ou desfazer), ver "Vitrine em cache" no
-- docs/status-pingo-de-mell.md.

set local lock_timeout = '2s';
set local statement_timeout = '10s';

do $$
begin
  if not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'categoria_produto' and e.enumlabel = 'Kits'
  ) then
    raise exception 'categoria_produto não tem o valor Kits: nada a renomear';
  end if;
  if exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'categoria_produto' and e.enumlabel = 'Kit Festa'
  ) then
    raise exception 'categoria_produto já tem o valor Kit Festa';
  end if;
end $$;

alter type public.categoria_produto rename value 'Kits' to 'Kit Festa';
