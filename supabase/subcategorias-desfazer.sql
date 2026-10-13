-- Desfaz supabase/subcategorias.sql.
--
-- ATENÇÃO: só vale ENQUANTO NENHUM PRODUTO TIVER subcategoria_id PREENCHIDO.
-- Depois da carga que vincula produtos a subcategorias, derrubar a coluna
-- apagaria os vínculos. O script cancela sozinho se achar algum.
--
-- Só com ok do Cainan, ou na hora, se a migração causar problema em produção.
-- Sem begin/commit próprios (ver subcategorias.sql). Não toca em nenhum dado de
-- produtos além de tirar a coluna nova (atualizado_em não muda).

set local lock_timeout = '2s';

do $$
begin
  if to_regclass('public.subcategorias') is null then
    raise exception 'public.subcategorias não existe: nada a desfazer';
  end if;
  if exists (select 1 from public.produtos where subcategoria_id is not null) then
    raise exception 'Há produto com subcategoria_id preenchido: desfazer apagaria os vínculos';
  end if;
end $$;

drop trigger produtos_limpa_subcategoria on public.produtos;
alter table public.produtos drop constraint produtos_subcategoria_fkey;
drop index public.produtos_subcategoria_idx;
alter table public.produtos drop column subcategoria_id;
drop function public.produtos_limpa_subcategoria();
drop table public.subcategorias;
drop function public.subcategorias_slug_no_cadastro();
drop function public.subcategorias_slug_imutavel();
drop function public.subcategoria_slug_livre(public.categoria_produto, text);
