-- Rotinas de exclusão de dados (PR exclusao-dados, item 7b).
--
-- Cumpre o que a Política de Privacidade promete (seção 5):
--   - pedido: conservado por 12 meses contados da data do pedido e depois
--     eliminado integralmente (dados do cliente e itens moram na própria
--     linha de public.pedidos; nenhuma tabela aponta para ela);
--   - IP do limite de pedidos: até 30 dias. A rotina apaga a linha de
--     public.pedidos_rate_limit 24 horas depois do início da última janela.
--
-- ADITIVA: extensão pg_cron, schema novo (privado), uma tabela nova, seis
-- funções novas e um job. Nada que já existe muda. Pela regra do CLAUDE.md
-- pode ir para produção antes do merge.
--
-- Sem begin/commit: quem aplica (a transação desfeita dos scripts de
-- scripts/banco/, ou o apply_migration do MCP) já abre a transação.
--
-- O projeto não tem backup automático (plano gratuito): o que a rotina
-- apaga não volta. Por isso: piso nos prazos, teto de volume para pedidos,
-- nenhuma data de referência em lugar nenhum, e um registro por execução.
--
-- Nada novo é acessível pela API: o schema privado não está nos schemas
-- expostos do PostgREST (public e graphql_public) e só o dono (postgres)
-- usa o schema. postgres é o papel do pg_cron (o job roda como quem o
-- agendou) e o da conexão direta dos scripts.

set local lock_timeout = '2s';

-- ---------------------------------------------------------------------
-- 1. pg_cron, pelo caminho da documentação da Supabase (guides/cron/install).
-- NUNCA remover a extensão: drop extension apaga todos os jobs.
-- O pg_cron interpreta o horário do job em UTC (cron.timezone = GMT,
-- conferido em 01/10/2026).
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- ---------------------------------------------------------------------
-- 2. Schema fora da API.
create schema if not exists privado;
revoke all on schema privado from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3. Constantes: o ÚNICO lugar dos dois prazos e do teto.
--   meses_pedidos: 12 meses de calendário (nunca 365 dias);
--   prazo_ip: 24 horas depois do início da última janela do IP. A janela do
--     limite (JANELA_SEGUNDOS em src/app/api/pedidos/route.ts, hoje 1 hora)
--     PRECISA ser menor que este prazo: senão a limpeza zeraria o contador
--     de uma janela ainda ativa. scripts/exclusao/janela-limite.test.mjs
--     falha se a janela mudar;
--   teto_pedidos: acima disso a rotina agendada não apaga pedido nenhum e
--     espera liberação manual (scripts/exclusao/executar-manual.mjs).
create or replace function privado.exclusao_constantes(
  out meses_pedidos integer,
  out prazo_ip interval,
  out teto_pedidos integer
)
language sql
immutable
security definer
set search_path = ''
as $$ select 12, interval '24 hours', 150 $$;

-- ---------------------------------------------------------------------
-- 4. Último dia de guarda de um pedido: o dia do pedido no relógio de
-- Brasília mais N meses de calendário. Não sabe que dia é hoje: quem
-- compara é a função que apaga, com "último dia < hoje" (estrito), então o
-- pedido sai na madrugada SEGUINTE ao último dia, nunca no próprio dia (a
-- entrega pode estar marcada para 12 meses exatos depois da criação).
-- Mês sem o dia (29/02 + 12 meses) fica no último dia do mês (28/02), como
-- somarMesesNaData em src/lib/tempo/brasilia.ts.
create or replace function privado.pedido_ultimo_dia_de_guarda(p_criado_em timestamptz, p_meses integer)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select ((p_criado_em at time zone 'America/Sao_Paulo')::date + make_interval(months => p_meses))::date
$$;

-- ---------------------------------------------------------------------
-- 5. Registro: uma linha por tabela afetada em toda execução, inclusive
-- quando apagou zero. Só contagens: nenhuma coluna guarda número de pedido,
-- IP, nome ou outro dado pessoal. Guardado sem prazo.
--   executado_em: clock_timestamp() capturado uma vez por chamada, o mesmo
--     nas duas linhas da execução (now() é fixo na transação e os testes
--     chamam a função várias vezes numa transação só);
--   teto: só na linha de pedidos;
--   candidatas: nulo quando a execução abortou por prazo inválido (nada foi
--     contado).
-- Sem coluna de id: uma sequência andaria a cada teste desfeito.
create table if not exists privado.exclusao_registro (
  executado_em timestamptz not null,
  origem text not null check (origem in ('agendada', 'manual')),
  tabela text not null check (tabela in ('pedidos', 'pedidos_rate_limit')),
  prazo interval not null,
  teto integer check (teto >= 0),
  candidatas integer check (candidatas >= 0),
  apagadas integer not null check (apagadas >= 0),
  status text not null check (status in ('ok', 'abortado_teto', 'abortado_prazo_invalido')),
  primary key (executado_em, tabela)
);
alter table privado.exclusao_registro enable row level security;
-- Sem política de propósito: só o dono.
revoke all on privado.exclusao_registro from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 6. Função interna: faz o trabalho. Recebe só durações e teto, nunca uma
-- data. Saídas:
--   - prazo inválido (pedidos < 12 meses ou IP < 1 hora, ou nulo): não
--     apaga nada nas duas tabelas, grava 2 linhas 'abortado_prazo_invalido'
--     e retorna normalmente;
--   - pedidos acima do teto: não apaga pedido nenhum, grava
--     'abortado_teto' com as candidatas; o IP é limpo mesmo assim (sem
--     teto);
--   - erro inesperado: exceção, tudo desfeito (inclusive o registro). O
--     motivo fica em cron.job_run_details. A ausência de linha é o sinal.
-- "Hoje" e os cortes saem de now() (início da transação), no relógio de
-- Brasília pelo nome do fuso: não supõe deslocamento fixo.
create or replace function privado.executar_exclusao(
  p_origem text,
  p_meses_pedidos integer,
  p_prazo_ip interval,
  p_teto_pedidos integer
)
returns table (
  r_tabela text,
  r_prazo interval,
  r_teto integer,
  r_candidatas integer,
  r_apagadas integer,
  r_status text
)
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_em timestamptz := clock_timestamp();
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_prazo_pedidos interval := make_interval(months => coalesce(p_meses_pedidos, 0));
  v_prazo_ip interval := coalesce(p_prazo_ip, interval '0');
  v_ids uuid[];
  v_cand_pedidos integer;
  v_apag_pedidos integer := 0;
  v_status_pedidos text;
  v_cand_ip integer;
  v_apag_ip integer := 0;
begin
  if p_origem is null or p_origem not in ('agendada', 'manual') then
    raise exception 'origem invalida' using errcode = '22023';
  end if;
  if p_teto_pedidos is null or p_teto_pedidos < 0 then
    raise exception 'teto invalido' using errcode = '22023';
  end if;

  -- Piso de segurança.
  if p_meses_pedidos is null or p_meses_pedidos < 12
     or p_prazo_ip is null or p_prazo_ip < interval '1 hour' then
    insert into privado.exclusao_registro
      (executado_em, origem, tabela, prazo, teto, candidatas, apagadas, status)
    values
      (v_em, p_origem, 'pedidos', v_prazo_pedidos, p_teto_pedidos, null, 0, 'abortado_prazo_invalido'),
      (v_em, p_origem, 'pedidos_rate_limit', v_prazo_ip, null, null, 0, 'abortado_prazo_invalido');
    return query values
      ('pedidos'::text, v_prazo_pedidos, p_teto_pedidos, null::integer, 0, 'abortado_prazo_invalido'::text),
      ('pedidos_rate_limit'::text, v_prazo_ip, null::integer, null::integer, 0, 'abortado_prazo_invalido'::text);
    return;
  end if;

  -- Pedidos: conta primeiro; só coleta os ids se couber no teto.
  select count(*) into v_cand_pedidos
  from public.pedidos p
  where privado.pedido_ultimo_dia_de_guarda(p.criado_em, p_meses_pedidos) < v_hoje;

  if v_cand_pedidos <= p_teto_pedidos then
    -- No máximo teto + 1 ids: se entrou candidata nova entre a contagem e a
    -- coleta e passou do teto, aborta do mesmo jeito.
    select coalesce(array_agg(x.id), '{}') into v_ids
    from (
      select p.id
      from public.pedidos p
      where privado.pedido_ultimo_dia_de_guarda(p.criado_em, p_meses_pedidos) < v_hoje
      limit p_teto_pedidos + 1
    ) x;
    v_cand_pedidos := greatest(v_cand_pedidos, cardinality(v_ids));
  end if;

  if v_cand_pedidos > p_teto_pedidos then
    v_status_pedidos := 'abortado_teto';
  else
    delete from public.pedidos p
    where p.id = any(v_ids)
      and privado.pedido_ultimo_dia_de_guarda(p.criado_em, p_meses_pedidos) < v_hoje;
    get diagnostics v_apag_pedidos = row_count;
    v_status_pedidos := 'ok';
  end if;

  -- IP: sem teto. Uma linha cujo janela_inicio é mais antigo que o prazo
  -- já está com a janela expirada (janela de 1 hora < 24 horas): apagá-la
  -- equivale ao recomeço do contador que a função de limite faria.
  select count(*) into v_cand_ip
  from public.pedidos_rate_limit r
  where r.janela_inicio < now() - p_prazo_ip;

  delete from public.pedidos_rate_limit r
  where r.janela_inicio < now() - p_prazo_ip;
  get diagnostics v_apag_ip = row_count;

  insert into privado.exclusao_registro
    (executado_em, origem, tabela, prazo, teto, candidatas, apagadas, status)
  values
    (v_em, p_origem, 'pedidos', v_prazo_pedidos, p_teto_pedidos, v_cand_pedidos, v_apag_pedidos, v_status_pedidos),
    (v_em, p_origem, 'pedidos_rate_limit', p_prazo_ip, null, v_cand_ip, v_apag_ip, 'ok');

  return query values
    ('pedidos'::text, v_prazo_pedidos, p_teto_pedidos, v_cand_pedidos, v_apag_pedidos, v_status_pedidos),
    ('pedidos_rate_limit'::text, p_prazo_ip, null::integer, v_cand_ip, v_apag_ip, 'ok'::text);
end;
$$;

-- ---------------------------------------------------------------------
-- 7. Função agendada: sem parâmetro nenhum, usa as constantes.
create or replace function privado.exclusao_agendada()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
begin
  select * into c from privado.exclusao_constantes();
  perform privado.executar_exclusao('agendada', c.meses_pedidos, c.prazo_ip, c.teto_pedidos);
end;
$$;

-- ---------------------------------------------------------------------
-- 8. Liberação manual: a mesma lógica com origem 'manual' e um teto
-- informado. Nunca aceita data nem prazo: os prazos vêm das constantes
-- (e passam pelo piso da função interna).
create or replace function privado.exclusao_manual(p_teto integer)
returns table (
  r_tabela text,
  r_prazo interval,
  r_teto integer,
  r_candidatas integer,
  r_apagadas integer,
  r_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
begin
  select * into c from privado.exclusao_constantes();
  return query select * from privado.executar_exclusao('manual', c.meses_pedidos, c.prazo_ip, p_teto);
end;
$$;

-- ---------------------------------------------------------------------
-- 9. Prévia (simulação): só leitura. Quantas linhas a rotina apagaria
-- agora, o intervalo de DIAS das candidatas (nenhum dado pessoal) e se a
-- rotina agendada abortaria pelo teto. Mesmo predicado da função interna.
create or replace function privado.exclusao_previa()
returns table (
  r_tabela text,
  r_prazo interval,
  r_teto integer,
  r_candidatas integer,
  r_dia_mais_antigo date,
  r_dia_mais_recente date,
  r_agendada_abortaria boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with c as (select * from privado.exclusao_constantes()),
  pedidos as (
    select (p.criado_em at time zone 'America/Sao_Paulo')::date dia
    from public.pedidos p, c
    where privado.pedido_ultimo_dia_de_guarda(p.criado_em, c.meses_pedidos)
          < (now() at time zone 'America/Sao_Paulo')::date
  ),
  ips as (
    select (r.janela_inicio at time zone 'America/Sao_Paulo')::date dia
    from public.pedidos_rate_limit r, c
    where r.janela_inicio < now() - c.prazo_ip
  )
  select 'pedidos', make_interval(months => c.meses_pedidos), c.teto_pedidos,
         (select count(*)::integer from pedidos), (select min(dia) from pedidos), (select max(dia) from pedidos),
         (select count(*) from pedidos) > c.teto_pedidos
  from c
  union all
  select 'pedidos_rate_limit', c.prazo_ip, null::integer,
         (select count(*)::integer from ips), (select min(dia) from ips), (select max(dia) from ips),
         false
  from c
$$;

-- ---------------------------------------------------------------------
-- 10. Ninguém além do dono executa nada disto. O padrão do papel postgres
-- já nasce fechado (supabase/seguranca-api.sql); o revoke fica explícito.
revoke execute on function privado.exclusao_constantes() from public, anon, authenticated, service_role;
revoke execute on function privado.pedido_ultimo_dia_de_guarda(timestamptz, integer) from public, anon, authenticated, service_role;
revoke execute on function privado.executar_exclusao(text, integer, interval, integer) from public, anon, authenticated, service_role;
revoke execute on function privado.exclusao_agendada() from public, anon, authenticated, service_role;
revoke execute on function privado.exclusao_manual(integer) from public, anon, authenticated, service_role;
revoke execute on function privado.exclusao_previa() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 11. Job diário às 06:00 UTC = 03:00 de Brasília. O Brasil hoje não tem
-- horário de verão; se voltar a ter, o job passa a rodar às 04:00 de
-- Brasília, o que não muda a regra (o "hoje" é calculado no fuso de
-- Brasília pelo nome, dentro da função). cron.schedule com um nome que já
-- existe atualiza o job em vez de criar outro.
select cron.schedule('exclusao_dados_diaria', '0 6 * * *', 'select privado.exclusao_agendada()');
