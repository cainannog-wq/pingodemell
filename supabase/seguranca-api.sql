-- Segurança da API: o que o visitante anônimo (e o logado) alcança pela API
-- do Supabase com a chave anônima que está no código do site.
--
-- NÃO-ADITIVA: retira permissões e uma política de objetos que já estão em
-- uso. Pela regra do CLAUDE.md, só vai para produção DEPOIS do merge do PR
-- seguranca-api, quando o Cainan pedir, uma única vez, com lock_timeout de 2s.
-- Status: AINDA NÃO APLICADA em produção.
--
-- Prova antes do merge: este arquivo roda inteiro dentro de uma transação
-- desfeita, seguido de todas as verificações, com
--   node scripts/banco/rodar-todos.mjs --com-migracao
-- (ver scripts/banco/lib.mjs). Por isso não tem begin/commit: quem aplica
-- (a transação desfeita dos scripts, ou o apply_migration do MCP) já abre
-- a transação.
--
-- Causa raiz do que escapou: a permissão padrão do schema public dá
-- EXECUTE em toda função nova a PUBLIC, anon e authenticated, e ALL em toda
-- tabela nova a anon e authenticated (a proteção fica só na RLS). O
-- "revoke ... from public" de pedidos-schema.sql não tira o grant dado por
-- nome a anon e authenticated.

set local lock_timeout = '2s';

-- ---------------------------------------------------------------------
-- D1. O limite de pedidos por IP só é chamado pelo servidor (POST
-- /api/pedidos, com a chave de serviço). Um anônimo chamando direto
-- conseguia encher a tabela, zerar o próprio contador e esgotar o limite
-- do IP de outra pessoa.
revoke execute on function public.registrar_tentativa_pedido(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.registrar_tentativa_pedido(text, integer, integer)
  to service_role;

-- ---------------------------------------------------------------------
-- D2. Pedido só é gravado pelo servidor (POST /api/pedidos: validação +
-- limite por IP + chave de serviço). A cliente continua pedindo sem login,
-- mas nenhum papel da API grava direto em pedidos — antes, um anônimo
-- pulava o servidor e o limite por IP não protegia nada.
-- Revogar INSERT da tabela leva junto os INSERT por coluna de
-- pedidos-hardening.sql. O gatilho que recalcula os totais continua.
drop policy if exists "Qualquer um pode criar pedido" on public.pedidos;
revoke insert on public.pedidos from anon, authenticated;

-- ---------------------------------------------------------------------
-- D3. Permissões que sobravam (a RLS já barrava; é a segunda camada).
-- TRUNCATE ignora a RLS: sai de anon e authenticated em tudo.

-- Anônimo: só leitura no que é público; nada no resto.
revoke all on public.produtos, public.produto_fotos, public.produto_cento_itens,
  public.dias_off, public.segunda_reaberturas
  from anon;
grant select on public.produtos, public.produto_fotos, public.produto_cento_itens,
  public.dias_off, public.segunda_reaberturas
  to anon;
revoke all on public.pedidos, public.pedidos_rate_limit, public.heartbeat from anon;

-- Logado (admin): continua lendo e escrevendo pelo painel; perde TRUNCATE
-- e as tabelas que só a chave de serviço usa.
revoke truncate on public.produtos, public.produto_cento_itens,
  public.dias_off, public.segunda_reaberturas, public.pedidos
  from authenticated;
revoke all on public.pedidos_rate_limit, public.heartbeat from authenticated;

-- Sem insert em pedidos, ninguém da API precisa do contador de número.
revoke all on sequence public.pedidos_numero_seq from anon, authenticated;

-- ---------------------------------------------------------------------
-- D4. Funções de gatilho não são para ser chamadas por ninguém direto (o
-- EXECUTE só é conferido ao criar o gatilho, não quando ele dispara).
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
revoke execute on function public.pedidos_recalcular_totais() from public, anon, authenticated;
revoke execute on function public.pedidos_set_status_atualizado_em() from public, anon, authenticated;
revoke execute on function public.produtos_set_atualizado_em() from public, anon, authenticated;
alter function public.pedidos_set_status_atualizado_em() set search_path = '';

-- ---------------------------------------------------------------------
-- D5. Toda função nova criada pelo papel postgres nasce sem EXECUTE para
-- anon e authenticated. O padrão global do Postgres dá EXECUTE a PUBLIC (e
-- anon/authenticated fazem parte de PUBLIC), por isso a segunda linha tira
-- também o padrão global do papel postgres. Quem precisar liberar uma
-- função nova faz um GRANT explícito, justificado no PR.
-- Limite: funções criadas pelo papel supabase_admin (painel da Supabase)
-- continuam com o padrão antigo — não temos permissão para mudar isso.
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres
  revoke execute on functions from public;
