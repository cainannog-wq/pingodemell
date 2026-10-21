-- Desfaz supabase/kit-pessoa-schema.sql.
--
-- ATENÇÃO: apaga as cinco tabelas e tudo o que elas guardam (listas de
-- opções, grupos, tamanhos e quantidades dos kits). Só vale enquanto nenhum
-- produto kit_pessoa estiver ativo e à venda: o script cancela sozinho se
-- achar algum. Não toca em public.produtos nem em nenhum outro dado.
--
-- Só com ok do Cainan, ou na hora, se a migração causar problema em produção.
-- Sem begin/commit próprios (ver kit-pessoa-schema.sql).

set local lock_timeout = '2s';

do $$
begin
  if to_regclass('public.kit_grupos') is null then
    raise exception 'public.kit_grupos não existe: nada a desfazer';
  end if;
  if exists (
    select 1 from public.kit_grupos g join public.produtos p on p.id = g.produto_id where p.ativo = true
  ) then
    raise exception 'Há produto ativo com composição de kit: desative antes de desfazer';
  end if;
end $$;

drop table public.kit_quantidades;
drop table public.kit_grupos;
drop table public.kit_tamanhos;
drop table public.kit_lista_itens;
drop table public.kit_listas;
