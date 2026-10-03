-- Desfaz supabase/pedidos-permissoes.sql: devolve ao papel logado
-- (authenticated) DELETE, UPDATE na tabela inteira, REFERENCES e TRIGGER em
-- public.pedidos, recria a política de exclusão (using (true)) e recria a
-- função public.registrar_tentativa_pedido como estava (corpo de
-- supabase/pedidos-schema.sql; permissões de supabase/seguranca-api.sql:
-- ninguém além do dono e do service_role executa). Nenhuma linha de nenhuma
-- tabela é tocada.
--
-- NÃO-ADITIVA. Só roda com o ok do Cainan, a menos que o painel de pedidos
-- de produção esteja quebrado pela migração.
--
-- RODAR DENTRO DE BEGIN E COMMIT: no editor SQL, escrever "begin;" antes do
-- conteúdo deste arquivo e "commit;" depois (o apply_migration da Supabase
-- já abre a transação sozinho). O set local abaixo só vale dentro da
-- transação. O arquivo não traz begin/commit próprios: eles fariam o
-- --com-migracao dos testes gravar em produção (o rodarMigracao de
-- scripts/banco/lib.mjs recusa). Provado numa transação desfeita por
-- scripts/banco/permissoes-pedidos.mjs (banco igual ao de antes da
-- migração).

set local lock_timeout = '2s';

-- 1. Pedidos: a permissão por coluna sai (a da tabela inteira volta a
-- valer para todas as colunas) e a política de exclusão volta.
revoke update (status) on public.pedidos from authenticated;
grant update, delete, references, trigger on public.pedidos to authenticated;
create policy "Autenticado pode excluir pedidos"
on public.pedidos for delete
to authenticated
using (true);

-- 2. Limite por IP antigo, idêntico ao de antes.
create function public.registrar_tentativa_pedido(
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

revoke execute on function public.registrar_tentativa_pedido(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.registrar_tentativa_pedido(text, integer, integer)
  to service_role;
