-- Calendário de dias sem produção (ex.: ponte de feriado), marcados com
-- antecedência pelo admin no CMS.
--
-- Já aplicado em produção via MCP do Supabase (mesmo projeto de sempre).
-- Este arquivo fica no repositório só como registro do schema, seguindo o
-- padrão dos outros .sql desta pasta (pedidos-schema.sql, produtos-campos-cms.sql).
--
-- Sem edição de dia off existente, só inserir ou remover — não existe
-- "meio termo" nesse dado, então não há policy de UPDATE.
--
-- RLS: leitura pública, escrita (insert/delete) restrita a autenticado —
-- mesmo padrão de "produtos", não o de "pedidos" (que também libera insert
-- anônimo). Justificativa: catálogo, carrinho e checkout ainda não existem
-- nesta entrega, mas quando o checkout (Fase 2, item 4) for implementado,
-- ele vai precisar ler esta tabela sem login para travar a data de entrega
-- no formulário público — leitura pública já deixa isso pronto, sem exigir
-- nova migração de RLS quando chegar a vez.
--
-- Sem efeito no cálculo de prazo de produção nem no checkout ainda —
-- decisão já registrada no escopo/roadmap em 22/09/2026. Isso fica para
-- quando o checkout for implementado, consumindo esta tabela para bloquear
-- a data de entrega.

create table public.dias_off (
  id uuid primary key default gen_random_uuid(),
  data date not null unique,
  criado_em timestamptz not null default now()
);

comment on table public.dias_off is
  'Datas marcadas pelo admin como sem produção (ex.: ponte de feriado). Leitura pública, escrita restrita a usuário autenticado do CMS. Sem edição — só inserir ou remover.';

alter table public.dias_off enable row level security;

create policy "Qualquer um pode ler dias off"
on public.dias_off for select
to public
using (true);

create policy "Autenticado pode criar dia off"
on public.dias_off for insert
to authenticated
with check (true);

create policy "Autenticado pode excluir dia off"
on public.dias_off for delete
to authenticated
using (true);
