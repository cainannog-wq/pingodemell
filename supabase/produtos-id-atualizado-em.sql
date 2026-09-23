-- Home do site público: id estável para a URL da interna de produto
-- (/produtos/{id}) e data da última edição para ordenar "Os mais pedidos".
--
-- Já aplicado em produção via MCP do Supabase (mesmo projeto de sempre),
-- em 23/09/2026 às 14:29 UTC. Este arquivo fica no repositório só como
-- registro do schema, seguindo o padrão dos outros .sql desta pasta
-- (produto-cento-itens.sql, etc.).
--
-- Migração puramente aditiva: só colunas novas com default, mais um
-- gatilho novo. Chave primária (nome), criado_em e políticas de RLS
-- continuam como estavam. Aplicada antes do merge do PR home-cliente,
-- seguindo a regra fechada com o Cainan em 22/09/2026 (ver CLAUDE.md).
--
-- Por que id: a chave primária é o nome, e o admin permite renomear o
-- produto, então uma URL pelo nome quebraria a cada troca de nome.
--
-- Por que atualizado_em: a tabela não tinha updated_at, e criado_em é nulo
-- em todos os produtos (sem default, e o admin não grava). Nos produtos que
-- já existiam, atualizado_em nasce com a data da migração (todos iguais);
-- o desempate de "Os mais pedidos" é pelo nome.

alter table public.produtos
  add column id uuid not null default gen_random_uuid(),
  add column atualizado_em timestamptz not null default now();

alter table public.produtos
  add constraint produtos_id_key unique (id);

comment on column public.produtos.id is 'Identificador estável do produto, usado na URL pública (/produtos/{id}). A chave primária continua sendo o nome.';
comment on column public.produtos.atualizado_em is 'Data da última alteração do produto (qualquer update, inclusive ligar/desligar ativo e destaque). Mantida pelo gatilho produtos_set_atualizado_em.';

create or replace function public.produtos_set_atualizado_em()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger produtos_set_atualizado_em
  before update on public.produtos
  for each row
  execute function public.produtos_set_atualizado_em();
