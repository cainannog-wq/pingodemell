-- Painel de pedidos — tabela `pedidos` + rate limit de escrita anônima.
--
-- Rode este arquivo inteiro no SQL Editor do painel do Supabase (Database
-- > SQL Editor > New query), do mesmo jeito que heartbeat.sql e
-- storage-policies.sql foram aplicados. Não há CLI/migração automática
-- neste projeto — é assim que o schema é aplicado aqui.
--
-- Modelo de dados dos itens do pedido: jsonb (coluna `itens`), não uma
-- tabela relacionada. Motivo: o checkout futuro insere o pedido inteiro
-- num único INSERT anônimo via PostgREST; um cliente anônimo não consegue
-- fazer uma transação multi-tabela sem uma função Postgres dedicada, então
-- jsonb mantém a escrita atômica e simples. Os itens são uma fotografia
-- do momento do pedido (nome/preço podem mudar depois no cardápio), não
-- precisam ser consultados individualmente nesta fase — se um dia for
-- necessário ("quantas vezes o produto X foi pedido"), dá pra migrar para
-- tabela relacionada depois sem quebrar o histórico já gravado.

create type public.pedido_status as enum (
  'aguardando_confirmacao',
  'em_producao',
  'entregue',
  'cancelado'
);

create type public.pedido_modo_entrega as enum ('entrega', 'retirada');

create table public.pedidos (
  id uuid primary key default gen_random_uuid(),
  numero integer generated always as identity (start with 1001) not null unique,

  cliente_nome text not null check (length(trim(cliente_nome)) > 0),
  cliente_whatsapp text not null check (length(trim(cliente_whatsapp)) > 0),
  cliente_email text,
  ocasiao text,

  modo_entrega public.pedido_modo_entrega not null,
  endereco text,
  data_hora_entrega timestamptz not null,
  forma_pagamento text not null check (length(trim(forma_pagamento)) > 0),
  observacoes text,

  -- Lista de itens no formato:
  -- [{ "nome": "Bolo de cenoura", "variacao": "2 andares", "quantidade": 1, "preco_unitario": 178.00 }, ...]
  itens jsonb not null,

  subtotal numeric(10, 2) not null check (subtotal >= 0),
  valor_entrega numeric(10, 2) not null default 0 check (valor_entrega >= 0),
  total numeric(10, 2) not null check (total >= 0),

  status public.pedido_status not null default 'aguardando_confirmacao',

  criado_em timestamptz not null default now(),
  status_atualizado_em timestamptz not null default now(),

  constraint pedidos_endereco_obrigatorio_na_entrega
    check (modo_entrega <> 'entrega' or (endereco is not null and length(trim(endereco)) > 0)),
  constraint pedidos_itens_eh_lista_nao_vazia
    check (jsonb_typeof(itens) = 'array' and jsonb_array_length(itens) > 0)
);

comment on table public.pedidos is
  'Pedidos fechados pelo cliente via WhatsApp. Insert público (anônimo) desde a criação, leitura/edição só para usuário autenticado do CMS.';

-- Mantém status_atualizado_em em dia sempre que o status muda (usado na
-- linha do tempo do detalhe do pedido).
create or replace function public.pedidos_set_status_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    new.status_atualizado_em := now();
  end if;
  return new;
end;
$$;

create trigger trg_pedidos_status_atualizado_em
before update on public.pedidos
for each row
execute function public.pedidos_set_status_atualizado_em();

alter table public.pedidos enable row level security;

-- INSERT público: é assim que o pedido nasce quando o checkout do carrinho
-- existir (cliente final anônimo, sem login). "to public" cobre tanto o
-- visitante anônimo quanto uma eventual sessão autenticada.
create policy "Qualquer um pode criar pedido"
on public.pedidos for insert
to public
with check (true);

-- SELECT/UPDATE/DELETE restritos a quem está logado no CMS (usuário único
-- de admin já existente).
create policy "Autenticado pode ver pedidos"
on public.pedidos for select
to authenticated
using (true);

create policy "Autenticado pode atualizar pedidos"
on public.pedidos for update
to authenticated
using (true)
with check (true);

create policy "Autenticado pode excluir pedidos"
on public.pedidos for delete
to authenticated
using (true);


-- ---------------------------------------------------------------------
-- Rate limit por IP no INSERT anônimo de pedidos.
--
-- Por que precisa disso: a policy acima libera INSERT anônimo direto na
-- tabela (é o requisito do checkout sem login), e o PostgREST do Supabase
-- não tem throttling nativo por IP numa tabela custom — só o Auth
-- (login) tem rate limit embutido. Sem uma camada própria, qualquer
-- pessoa pode gerar flood de pedido falso direto no banco.
--
-- Mecanismo escolhido: um Route Handler do Next.js (app/api/pedidos,
-- POST) na frente do insert, chamado pelo futuro formulário de checkout
-- em vez de o navegador chamar o Supabase direto. Ele confere/incrementa
-- a contagem aqui (via service role, que ignora RLS) e só faz o insert
-- (com a anon key, respeitando a policy acima) se o IP ainda não estourou
-- o limite da janela. Considerei uma Supabase Edge Function (era o
-- exemplo citado no pedido), mas o Route Handler faz o mesmo papel de
-- "borda na frente do insert" sem precisar de um segundo pipeline de
-- deploy (Supabase CLI + token) — já sai no mesmo deploy do Netlify que
-- este projeto já usa.
--
-- Limitação honesta: RLS por si só não sabe IP nenhum — quem decide o
-- limite é sempre a camada de aplicação (Route Handler). Um cliente que
-- ignore o Route Handler e chame a tabela direto via PostgREST continua
-- sujeito só à RLS (inserção liberada), não ao rate limit. Não dá pra
-- fechar essa brecha sem tirar o INSERT público exigido pelo checkout.
--
-- Sem policy nenhuma aqui de propósito — mesmo padrão da tabela
-- `heartbeat`: com RLS ligado e zero policy, nem anon nem authenticated
-- leem ou escrevem; só a service role key (usada só no servidor, nunca
-- no navegador) acessa.
create table public.pedidos_rate_limit (
  ip text primary key,
  janela_inicio timestamptz not null default now(),
  contagem integer not null default 1
);

alter table public.pedidos_rate_limit enable row level security;

-- Registra uma tentativa de criar pedido vinda do IP `p_ip` e devolve se
-- ela deve ser permitida. UPSERT único (atômico: o lock de linha do
-- ON CONFLICT evita corrida entre duas requisições simultâneas do mesmo
-- IP) — reseta a contagem se a janela anterior já expirou, incrementa
-- caso contrário.
create or replace function public.registrar_tentativa_pedido(
  p_ip text,
  p_janela_segundos integer,
  p_limite integer
)
returns table (permitido boolean, contagem integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contagem integer;
begin
  insert into public.pedidos_rate_limit as r (ip, janela_inicio, contagem)
  values (p_ip, now(), 1)
  on conflict (ip) do update
    set contagem = case
          when now() - r.janela_inicio > make_interval(secs => p_janela_segundos) then 1
          else r.contagem + 1
        end,
        janela_inicio = case
          when now() - r.janela_inicio > make_interval(secs => p_janela_segundos) then now()
          else r.janela_inicio
        end
  returning r.contagem into v_contagem;

  return query select (v_contagem <= p_limite), v_contagem;
end;
$$;

revoke all on function public.registrar_tentativa_pedido(text, integer, integer) from public;
grant execute on function public.registrar_tentativa_pedido(text, integer, integer) to service_role;
