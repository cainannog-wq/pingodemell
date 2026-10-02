-- Gravação do pedido pelo site (PR confirmacao-e-gravacao, item 7).
--
-- ADITIVA: duas colunas novas em pedidos (uma aceita nulo, a outra tem valor
-- padrão), um índice único sobre a coluna nova, uma tabela nova e duas
-- funções novas. Nada que já existe muda. Pela regra do CLAUDE.md pode ir
-- para produção antes do merge.
--
-- Sem begin/commit: quem aplica (a transação desfeita dos scripts de
-- scripts/banco/, ou o apply_migration do MCP) já abre a transação.
--
-- O que NÃO muda: valor_entrega continua obrigatório com padrão 0. O pedido
-- do site nasce com 0 e o site mostra "a combinar" na entrega (retirada:
-- "sem custo"). Entrega grátis de verdade não se distingue de "a combinar"
-- enquanto a coluna for obrigatória; deixá-la aceitar vazio é não-aditiva e
-- fica para depois do merge na main.

set local lock_timeout = '2s';

-- ---------------------------------------------------------------------
-- 1. Colunas novas em pedidos.

-- Chave gerada pelo navegador ao abrir o checkout (uuid). O índice único
-- decide o pedido repetido: reenviar com a mesma chave devolve o mesmo
-- pedido. Pedidos antigos ficam com nulo (o índice aceita vários nulos).
alter table public.pedidos add column if not exists chave_idempotencia uuid;
create unique index if not exists pedidos_chave_idempotencia_key
  on public.pedidos (chave_idempotencia);

-- Pedido gravado fora da produção (homologação, Deploy Preview, máquina
-- local) ou pedido de teste antigo. Quem decide é o servidor, pelo CONTEXT
-- da Netlify embutido no build; nenhum campo do navegador define isto. O
-- painel esconde esses pedidos por padrão.
alter table public.pedidos add column if not exists teste boolean not null default false;

-- ---------------------------------------------------------------------
-- 2. Interruptor da gravação: uma linha por ambiente. Desligado, a rota
-- responde 409 e o site segue no "modo sem registro" (nada é gravado).
-- Linha ausente conta como desligado. Só a chave de serviço lê e escreve;
-- quem liga e desliga é o Cainan, pelo editor SQL da Supabase (passo a passo
-- em docs/status-pingo-de-mell.md).
create table if not exists public.pedidos_gravacao (
  contexto text primary key check (contexto in ('producao', 'fora_producao')),
  ligada boolean not null,
  atualizado_em timestamptz not null default now()
);
alter table public.pedidos_gravacao enable row level security;
-- Sem política de propósito (como pedidos_rate_limit): anon e authenticated
-- nem têm permissão.
revoke all on public.pedidos_gravacao from public, anon, authenticated;

-- Estado inicial: produção desligada, demais ambientes ligados.
insert into public.pedidos_gravacao (contexto, ligada) values
  ('producao', false),
  ('fora_producao', true)
on conflict (contexto) do nothing;

-- ---------------------------------------------------------------------
-- 3. Limite por IP que também diz quanto falta para a janela recomeçar
-- (cabeçalho Retry-After). Mesma tabela e mesma conta da
-- registrar_tentativa_pedido, que fica por ora (candidata a remoção depois
-- do merge na main). Janela fixa: começa na primeira tentativa contada.
create or replace function public.registrar_tentativa_pedido_v2(
  p_ip text,
  p_janela_segundos integer,
  p_limite integer
)
returns table (permitido boolean, contagem integer, retry_segundos integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contagem integer;
  v_inicio timestamptz;
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
  returning r.contagem, r.janela_inicio into v_contagem, v_inicio;

  return query select
    v_contagem <= p_limite,
    v_contagem,
    greatest(1, ceil(extract(epoch from (v_inicio + make_interval(secs => p_janela_segundos) - now())))::integer);
end;
$$;

revoke execute on function public.registrar_tentativa_pedido_v2(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.registrar_tentativa_pedido_v2(text, integer, integer)
  to service_role;

-- ---------------------------------------------------------------------
-- 4. Gravação do pedido numa transação só, chamada por POST /api/pedidos
-- DEPOIS de a validação dos campos passar:
--   a. interruptor do ambiente desligado (ou linha ausente): 'desligado',
--      nada é gravado nem contado;
--   b. trava pela chave de idempotência (dois cliques simultâneos esperam
--      um pelo outro);
--   c. pedido com a mesma chave já existe: 'existente', devolve o mesmo
--      número e NÃO conta no limite por IP (mesmo que o corpo seja outro);
--   d. conta o IP; acima do teto: 'bloqueado' com os segundos de espera;
--   e. grava com on conflict do nothing — o índice único continua sendo a
--      proteção final.
-- Devolve número, itens e totais; nunca dado pessoal (a rota só repassa o
-- valor de cada linha e os totais). Os totais saem do gatilho
-- pedidos_recalcular_totais (quantidade × preco_unitario de cada item).
create or replace function public.criar_pedido(
  p_contexto text,
  p_chave uuid,
  p_pedido jsonb,
  p_teste boolean,
  p_ip text,
  p_janela_segundos integer,
  p_limite integer
)
returns table (
  r_situacao text,
  r_numero integer,
  r_itens jsonb,
  r_subtotal numeric,
  r_total numeric,
  r_retry_segundos integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ligada boolean;
  v_numero integer;
  v_itens jsonb;
  v_subtotal numeric;
  v_total numeric;
  v_permitido boolean;
  v_retry integer;
begin
  select g.ligada into v_ligada from public.pedidos_gravacao g where g.contexto = p_contexto;
  if v_ligada is not true then
    return query select 'desligado'::text, null::integer, null::jsonb, null::numeric, null::numeric, null::integer;
    return;
  end if;

  if p_chave is null then
    raise exception 'chave de idempotencia obrigatoria' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('criar_pedido:' || p_chave::text, 0));

  select p.numero, p.itens, p.subtotal, p.total
    into v_numero, v_itens, v_subtotal, v_total
  from public.pedidos p
  where p.chave_idempotencia = p_chave;
  if found then
    return query select 'existente'::text, v_numero, v_itens, v_subtotal, v_total, null::integer;
    return;
  end if;

  select t.permitido, t.retry_segundos into v_permitido, v_retry
  from public.registrar_tentativa_pedido_v2(p_ip, p_janela_segundos, p_limite) t;
  if not v_permitido then
    return query select 'bloqueado'::text, null::integer, null::jsonb, null::numeric, null::numeric, v_retry;
    return;
  end if;

  insert into public.pedidos (
    cliente_nome, cliente_whatsapp, cliente_email, ocasiao, modo_entrega, endereco,
    data_hora_entrega, forma_pagamento, observacoes, itens,
    subtotal, valor_entrega, total, chave_idempotencia, teste
  ) values (
    p_pedido ->> 'cliente_nome',
    p_pedido ->> 'cliente_whatsapp',
    p_pedido ->> 'cliente_email',
    p_pedido ->> 'ocasiao',
    (p_pedido ->> 'modo_entrega')::public.pedido_modo_entrega,
    p_pedido ->> 'endereco',
    (p_pedido ->> 'data_hora_entrega')::timestamptz,
    p_pedido ->> 'forma_pagamento',
    p_pedido ->> 'observacoes',
    p_pedido -> 'itens',
    0, 0, 0,
    p_chave,
    coalesce(p_teste, true)
  )
  on conflict (chave_idempotencia) do nothing
  returning numero, itens, subtotal, total into v_numero, v_itens, v_subtotal, v_total;

  if v_numero is null then
    -- Só acontece se alguém gravou a mesma chave sem passar pela trava.
    select p.numero, p.itens, p.subtotal, p.total
      into v_numero, v_itens, v_subtotal, v_total
    from public.pedidos p
    where p.chave_idempotencia = p_chave;
    return query select 'existente'::text, v_numero, v_itens, v_subtotal, v_total, null::integer;
    return;
  end if;

  return query select 'criado'::text, v_numero, v_itens, v_subtotal, v_total, null::integer;
end;
$$;

revoke execute on function public.criar_pedido(text, uuid, jsonb, boolean, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.criar_pedido(text, uuid, jsonb, boolean, text, integer, integer)
  to service_role;
