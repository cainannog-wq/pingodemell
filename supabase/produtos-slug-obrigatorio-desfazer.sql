-- Desfaz a etapa 2 do slug (supabase/produtos-slug-obrigatorio.sql): o
-- slug volta a aceitar vazio e o gatilho de edição volta ao corpo da etapa
-- 1 (supabase/produtos-slug.sql, linhas 123 a 141), com o ramo "vazio ->
-- preenchido". Nenhuma linha de produtos é tocada; slugs gravados ficam.
--
-- Etapa 2 aplicada em produção em 02/10/2026 19:21:39 UTC (registro
-- 20261002192139 produtos_slug_obrigatorio). Depois dela, este é o desfazer
-- que vale; supabase/produtos-slug-desfazer.sql (desfaz a etapa 1) só pode
-- rodar depois deste.
--
-- NÃO-ADITIVA (muda uma coluna e uma função em uso). Só roda com o ok do
-- Cainan, a menos que o admin ou o site de produção estejam quebrados pela
-- etapa 2.
--
-- RODAR DENTRO DE BEGIN E COMMIT: no editor SQL, escrever "begin;" antes
-- do conteúdo deste arquivo e "commit;" depois (o apply_migration da
-- Supabase já abre a transação sozinho). O set local abaixo só vale dentro
-- da transação. O arquivo não traz begin/commit próprios, como a etapa 2:
-- eles fariam o --com-migracao dos testes gravar em produção (o
-- rodarMigracao de scripts/banco/lib.mjs recusa). Provado numa transação
-- desfeita por scripts/banco/slug-migracao.mjs (slug-migração 10).

set local lock_timeout = '2s';

alter table public.produtos alter column slug drop not null;

create or replace function public.produtos_slug_imutavel()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.slug is not distinct from old.slug then
    return new;
  end if;
  if old.slug is not null then
    raise exception 'O endereço (slug) do produto "%" é fixo e não pode mudar: continua "%".', old.nome, old.slug
      using errcode = 'check_violation';
  end if;
  if (to_jsonb(new) - 'slug' - 'atualizado_em') = (to_jsonb(old) - 'slug' - 'atualizado_em') then
    new.atualizado_em := old.atualizado_em;
  end if;
  return new;
end;
$$;

revoke execute on function public.produtos_slug_imutavel() from public, anon, authenticated;
