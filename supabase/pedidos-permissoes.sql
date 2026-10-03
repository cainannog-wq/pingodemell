-- Permissões do papel logado em pedidos e remoção do limite por IP antigo
-- (PR permissoes-pedidos).
--
-- 1. authenticated (o painel logado) perde DELETE, UPDATE, REFERENCES e
--    TRIGGER em public.pedidos e ganha UPDATE só na coluna status. A
--    política "Autenticado pode excluir pedidos" é apagada. Leitura (SELECT)
--    e MAINTAIN ficam como estão. O painel só muda o status
--    (src/app/admin/pedidos/actions.ts); nenhum código apaga pedido. A
--    rotina de exclusão diária (privado.executar_exclusao) não depende de
--    nada disso: é SECURITY DEFINER do postgres, dono da tabela, e a RLS de
--    pedidos não é forçada. O gatilho de status_atualizado_em continua
--    valendo: coluna mudada por gatilho não exige permissão de coluna.
--    REFERENCES e TRIGGER: nenhuma chave estrangeira aponta para pedidos,
--    authenticated não cria objeto em public, e nenhum código cria gatilho
--    como logado; sem uso, saem.
-- 2. A função public.registrar_tentativa_pedido (limite por IP antigo) é
--    removida. A rota usa criar_pedido, que chama registrar_tentativa_pedido_v2.
--
-- NÃO-ADITIVA (muda permissão e política de tabela em uso e apaga uma
-- função). Só vai a produção depois do merge do PR, com o ok explícito do
-- Cainan.
--
-- RODAR DENTRO DE BEGIN E COMMIT: no editor SQL, escrever "begin;" antes do
-- conteúdo deste arquivo e "commit;" depois (o apply_migration da Supabase
-- já abre a transação sozinho). O set local abaixo só vale dentro da
-- transação. O arquivo não traz begin/commit próprios: eles fariam o
-- --com-migracao dos testes gravar em produção (o rodarMigracao de
-- scripts/banco/lib.mjs recusa).
--
-- As conferências abaixo cancelam tudo, sem mudar nada, se o banco não
-- estiver no estado esperado.
--
-- Prova antes de aplicar:
--   node scripts/banco/rodar-todos.mjs --com-migracao=supabase/pedidos-permissoes.sql
-- Desfazer: supabase/pedidos-permissoes-desfazer.sql.

set local lock_timeout = '2s';

do $$
declare
  v_colunas text;
  v_citam text;
begin
  -- Estado de antes: a função antiga existe e a política de exclusão também.
  if to_regprocedure('public.registrar_tentativa_pedido(text, integer, integer)') is null then
    raise exception 'Permissões de pedidos canceladas: registrar_tentativa_pedido não existe (migração já aplicada?).';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_policy
    where polrelid = 'public.pedidos'::regclass and polname = 'Autenticado pode excluir pedidos'
  ) then
    raise exception 'Permissões de pedidos canceladas: a política de exclusão de pedidos não existe (migração já aplicada?).';
  end if;

  -- Nenhuma permissão por coluna em pedidos (attacl). Hoje não existe
  -- nenhuma: tudo vem da permissão da tabela.
  select string_agg(attname || '=' || attacl::text, '; ' order by attnum)
    into v_colunas
  from pg_catalog.pg_attribute
  where attrelid = 'public.pedidos'::regclass and attnum > 0 and not attisdropped and attacl is not null;
  if v_colunas is not null then
    raise exception 'Permissões de pedidos canceladas: permissão por coluna inesperada (%).', v_colunas;
  end if;

  -- Nenhuma outra função cita a função antiga (registrar_tentativa_pedido_v2
  -- não conta: \M exige o fim da palavra logo depois de "pedido").
  select string_agg(p.oid::regprocedure::text, ', ')
    into v_citam
  from pg_catalog.pg_proc p
  where p.prosrc ~ '\mregistrar_tentativa_pedido\M'
    and p.oid <> 'public.registrar_tentativa_pedido(text, integer, integer)'::regprocedure;
  if v_citam is not null then
    raise exception 'Remoção de registrar_tentativa_pedido cancelada: citada por %.', v_citam;
  end if;
end;
$$;

-- 1. Pedidos: o logado lê e muda só o status.
revoke delete, update, references, trigger on public.pedidos from authenticated;
grant update (status) on public.pedidos to authenticated;
drop policy "Autenticado pode excluir pedidos" on public.pedidos;

-- 2. Limite por IP antigo.
drop function public.registrar_tentativa_pedido(text, integer, integer);
