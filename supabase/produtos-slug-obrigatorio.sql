-- URL amigável do produto (slug), etapa 2 de 2: slug obrigatório.
--
-- NÃO-ADITIVA (NOT NULL em tabela que já tem linhas). Só depois de o lote
-- chegar à main, quando o Cainan pedir. Antes, a conferência abaixo cancela
-- tudo se existir produto sem slug. Etapa 1: supabase/produtos-slug.sql.
--
-- Sem begin/commit (quem aplica abre a transação). Prova antes de aplicar:
-- scripts/banco/slug.mjs roda este arquivo num cenário desfeito.

set local lock_timeout = '2s';

do $$
begin
  if exists (select 1 from public.produtos where slug is null or slug = '') then
    raise exception 'Etapa 2 cancelada: existe produto sem slug.';
  end if;
end;
$$;

alter table public.produtos alter column slug set not null;

-- Com o slug obrigatório, o ramo "vazio -> preenchido" do gatilho de edição
-- (que devolvia o atualizado_em antigo no preenchimento da etapa 1) deixa
-- de ter uso: sai. A partir daqui, qualquer mudança de slug é recusada, e
-- o gatilho não depende mais da ordem em relação a
-- produtos_set_atualizado_em.
create or replace function public.produtos_slug_imutavel()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.slug is distinct from old.slug then
    raise exception 'O endereço (slug) do produto "%" é fixo e não pode mudar: continua "%".', old.nome, old.slug
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke execute on function public.produtos_slug_imutavel() from public, anon, authenticated;
