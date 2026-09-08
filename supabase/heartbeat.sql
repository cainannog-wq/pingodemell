-- Tabela usada apenas para manter o projeto Supabase ativo (evitar pausa
-- automática por inatividade no plano gratuito). Não expõe dados, não tem
-- policy pública: só é acessível via service role key.
create table if not exists public.heartbeat (
  id smallint primary key default 1,
  pinged_at timestamptz not null default now(),
  constraint heartbeat_singleton check (id = 1)
);

insert into public.heartbeat (id, pinged_at)
values (1, now())
on conflict (id) do nothing;

alter table public.heartbeat enable row level security;
-- Nenhuma policy é criada de propósito: com RLS ligado e sem policies,
-- anon/authenticated não conseguem ler nem escrever. A service role key
-- ignora RLS por padrão, então o GitHub Action consegue atualizar normalmente.
