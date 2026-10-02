-- Catálogo de recheios (PR bolo-bento): tabela única, compartilhada entre o
-- Bolo grande e o Bento Cake. Cada linha diz onde vale (vale_bolo,
-- vale_bento, duas colunas independentes), para a Taami cadastrar o mesmo
-- recheio uma vez só.
--
-- ADITIVA (tabela nova e enum novo, sem tocar em nada que existe). Pode ir
-- para produção antes do merge (regra do CLAUDE.md). Prova antes de
-- aplicar:
--   node scripts/banco/rodar-todos.mjs --com-migracao=supabase/recheios-schema.sql
--
-- Regras no próprio banco:
-- - vale em pelo menos um lugar (bolo ou bento);
-- - vale_bolo: preco_kg (> 0) e grupo são obrigatórios; senão, nulos;
-- - nome único sem diferenciar maiúscula (evita "Chocolate" e "chocolate"
--   como dois recheios);
-- - soft delete (ativo), nunca apagado pelo CMS.
--
-- Sem begin/commit: quem aplica (transação desfeita dos testes, ou o
-- apply_migration do MCP) já abre a transação.
--
-- Desfazer (só se ninguém usa):
--   drop table public.recheios; drop type public.recheio_grupo;

set local lock_timeout = '2s';

create type public.recheio_grupo as enum ('frutas', 'chocolate_outros');

create table public.recheios (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  vale_bolo boolean not null default false,
  vale_bento boolean not null default false,
  preco_kg numeric(10, 2),
  grupo public.recheio_grupo,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint recheios_nome_formato check (nome = btrim(nome) and length(nome) between 1 and 80),
  constraint recheios_vale_em_algum_lugar check (vale_bolo or vale_bento),
  constraint recheios_dados_do_bolo check (
    (vale_bolo and preco_kg is not null and preco_kg > 0 and grupo is not null)
    or (not vale_bolo and preco_kg is null and grupo is null)
  )
);

create unique index recheios_nome_key on public.recheios (lower(nome));

comment on table public.recheios is 'Catálogo único de recheios. vale_bolo: aparece no Bolo grande, agrupado, com preco_kg. vale_bento: aparece na lista simples do Bento Cake (informativo, sem efeito no preço). Nunca apagado pelo CMS: ativo = false.';
comment on column public.recheios.preco_kg is 'R$ por kg; só existe quando vale_bolo. Preço do item de Bolo = preco_kg × kg.';
comment on column public.recheios.grupo is 'Grupo de exibição no Bolo grande (frutas | chocolate_outros); só existe quando vale_bolo.';

create function public.recheios_set_atualizado_em()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

revoke execute on function public.recheios_set_atualizado_em() from public, anon, authenticated;

create trigger recheios_set_atualizado_em
before update on public.recheios
for each row
execute function public.recheios_set_atualizado_em();

alter table public.recheios enable row level security;

-- Padrão de produtos: o visitante lê só o ativo; o admin logado lê tudo.
-- Qual recheio vale onde (vale_bolo / vale_bento) é filtro do código, não
-- segredo: não entra na política.
create policy "Anonimo le so recheio ativo"
  on public.recheios for select
  to anon
  using (ativo = true);

create policy "Autenticado le todos os recheios"
  on public.recheios for select
  to authenticated
  using (true);

create policy "Somente autenticado insere recheio"
  on public.recheios for insert
  to authenticated
  with check (true);

create policy "Somente autenticado edita recheio"
  on public.recheios for update
  to authenticated
  using (true)
  with check (true);

create policy "Somente autenticado apaga recheio"
  on public.recheios for delete
  to authenticated
  using (true);

-- Tabela nova nasce com todas as permissões para anon e authenticated
-- (a proteção seria só a RLS): tira o que o papel não precisa. TRUNCATE
-- sempre, porque ignora a RLS.
revoke all on table public.recheios from public, anon, authenticated;
grant select on table public.recheios to anon;
grant select, insert, update, delete on table public.recheios to authenticated;
