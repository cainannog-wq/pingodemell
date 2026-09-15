-- Correção — Auditoria de segurança de 14/09/2026, achado B12 (mass
-- assignment) em `pedidos`, confirmado com teste real contra produção
-- (scripts/test-mass-assignment-pedidos.mjs).
--
-- Rode este arquivo inteiro no SQL Editor do painel do Supabase (Database
-- > SQL Editor > New query), do mesmo jeito que pedidos-schema.sql e
-- storage-policies.sql foram aplicados — não há CLI/migração automática
-- neste projeto.
--
-- O que estava errado: a policy de INSERT de `pedidos` ("with check
-- (true)") libera o insert em si, mas não restringe QUAIS colunas um
-- cliente anônimo pode preencher. Batendo direto no PostgREST com a anon
-- key (sem passar pelo Route Handler /api/pedidos, que é só uma camada
-- de validação da aplicação, não do banco), dava pra:
--   1. gravar status="entregue" direto no insert, pulando
--      "aguardando_confirmacao" e todo o fluxo manual do painel;
--   2. escolher o próprio "id" (uuid) do pedido;
--   3. forjar "criado_em" com qualquer data, distorcendo os cards de
--      resumo do painel ("pedidos no mês", etc.) e o histórico;
--   4. gravar subtotal/total que não batem com os itens de verdade (ex.:
--      um bolo de R$500 registrado como R$0,01) — o recálculo em
--      src/app/api/pedidos/route.ts só vale pra quem passa por aquela
--      rota; o insert direto na tabela não tinha nenhuma validação de
--      conteúdo equivalente.
-- "numero" já estava protegido (é GENERATED ALWAYS AS IDENTITY — o
-- Postgres rejeita insert com valor explícito nessa coluna
-- independentemente de RLS ou grant), confirmado pelo mesmo teste.
--
-- Duas correções, em camadas diferentes:
--
-- A) Privilégio por coluna (GRANT/REVOKE) para id/status/criado_em/
--    status_atualizado_em: essas colunas passam a não aceitar valor
--    nenhum vindo de anon/authenticated no insert — sempre usam o
--    DEFAULT do schema. Isso fecha os itens 1, 2 e 3 acima na origem,
--    antes até da RLS ser avaliada.
--
-- B) Trigger que recalcula subtotal/total a partir de `itens` sempre que
--    um pedido é inserido, ignorando qualquer subtotal/total vindo do
--    cliente. Fecha o item 4 sem quebrar quem já manda subtotal/total
--    corretos (Route Handler e os testes automatizados) — o valor só é
--    sobrescrito quando diverge do que os itens realmente somam.
--
-- Mais uma camada de defesa (C), redundante com (A) de propósito: a
-- própria policy de insert passa a exigir status = default. Se um dia o
-- GRANT/REVOKE de (A) for resetado sem querer (ex.: alguém rodar um
-- script que recria os grants padrão do Supabase), essa policy ainda
-- barra o insert com status diferente do inicial.

-- ---------------------------------------------------------------------
-- A) Restringe quais colunas anon/authenticated podem preencher no INSERT.
revoke insert on public.pedidos from anon, authenticated;

grant insert (
  cliente_nome, cliente_whatsapp, cliente_email, ocasiao,
  modo_entrega, endereco, data_hora_entrega, forma_pagamento,
  observacoes, itens, subtotal, valor_entrega, total
) on public.pedidos to anon, authenticated;

-- id, numero, status, criado_em, status_atualizado_em ficam de fora da
-- lista acima de propósito: sempre usam o DEFAULT da tabela, nunca um
-- valor vindo do cliente.

-- ---------------------------------------------------------------------
-- B) Recalcula subtotal/total a partir de `itens` no INSERT, sem confiar
-- no que o cliente mandou.
create or replace function public.pedidos_recalcular_totais()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_subtotal numeric(10, 2);
begin
  select coalesce(sum((item ->> 'quantidade')::numeric * (item ->> 'preco_unitario')::numeric), 0)
    into v_subtotal
  from jsonb_array_elements(new.itens) as item;

  new.subtotal := round(v_subtotal, 2);
  new.total := round(v_subtotal + coalesce(new.valor_entrega, 0), 2);

  return new;
end;
$$;

drop trigger if exists trg_pedidos_recalcular_totais on public.pedidos;
create trigger trg_pedidos_recalcular_totais
before insert on public.pedidos
for each row
execute function public.pedidos_recalcular_totais();

-- ---------------------------------------------------------------------
-- C) Defesa redundante: mesmo que o GRANT/REVOKE de (A) seja desfeito
-- por engano no futuro, a policy de insert continua travando status.
drop policy if exists "Qualquer um pode criar pedido" on public.pedidos;
create policy "Qualquer um pode criar pedido"
on public.pedidos for insert
to public
with check (status = 'aguardando_confirmacao'::public.pedido_status);

-- ---------------------------------------------------------------------
-- Verificação manual opcional (não obrigatória — o teste automatizado
-- scripts/test-mass-assignment-pedidos.mjs já cobre isso): confirma que
-- os grants ficaram como esperado.
--
-- select table_name, column_name, grantee, privilege_type
-- from information_schema.column_privileges
-- where table_schema = 'public' and table_name = 'pedidos' and privilege_type = 'INSERT'
-- order by grantee, column_name;
