-- Unidade de venda do produto (PR 2d): coluna nova, opcional, texto livre.
--
-- ADITIVA (coluna nova que aceita nulo, sem default, com uma restrição que
-- só olha a própria coluna). Pode ir para produção antes do merge (regra do
-- CLAUDE.md). O admin de produção (main) não envia a coluna e continua
-- funcionando igual; o site só passa a ler a coluna com o código do lote.
-- Status: ver docs/status-pingo-de-mell.md (tabela de migrações).
--
-- Sem gatilho novo: acrescentar coluna não dispara o gatilho de edição
-- (produtos_set_atualizado_em), então nenhum atualizado_em muda.
-- Texto, não enum: a lista de unidades cresce com o catálogo (o admin
-- sugere kg, unidade, cento e litro, mas aceita outra). Nulo = o card mostra
-- só o preço, como antes.
--
-- Sem begin/commit: quem aplica (a transação desfeita dos testes, ou o
-- apply_migration do MCP) já abre a transação. Prova antes de aplicar:
--   node scripts/banco/rodar-todos.mjs --com-migracao=supabase/produtos-unidade-venda.sql
--
-- Desfazer (só se nenhum produto tiver unidade preenchida):
--   alter table public.produtos drop column unidade_venda;

set local lock_timeout = '2s';

alter table public.produtos add column unidade_venda text;

comment on column public.produtos.unidade_venda is 'Unidade em que o preço é dado (kg, unidade, cento, litro ou outro texto). Opcional; nulo = o card mostra só o preço. Quantidades são sempre inteiras (pedido_minimo), então em kg não existe meio quilo.';

alter table public.produtos add constraint produtos_unidade_venda_formato
  check (unidade_venda is null or (unidade_venda = btrim(unidade_venda) and length(unidade_venda) between 1 and 20));
