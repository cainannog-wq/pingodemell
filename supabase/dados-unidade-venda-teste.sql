-- Preenche produtos.unidade_venda em alguns produtos de TESTE (fictícios,
-- saem antes da carga real), para a interna de produto (item 3) ter um caso
-- real preenchido além do vazio. Mapeamento confirmado pelo Cainan em
-- 28/09/2026:
--   kg      → Bolo de Chocolate com Ninho
--   unidade → Morango Banhado, Brigadeiro Gourmet, Suco de Laranja Natural (1L)
--             (vendido por garrafa) e os 3 Centos (1 cento = 100 unidades; o
--             site continua mostrando "o cento" para o tipo Cento)
-- Todos os outros ficam vazios.
--
-- NÃO é migração de schema: só dados. Grava em produção, por isso só com o
-- ok do Cainan, depois da prova em transação desfeita:
--   node scripts/banco/unidade-venda-dados.mjs
--
-- atualizado_em preservado: o gatilho produtos_set_atualizado_em grava a
-- hora atual em todo update (e "Os mais pedidos" da Home ordena por essa
-- data). O papel postgres não pode usar session_replication_role, então o
-- gatilho é desligado só dentro desta transação e religado no fim; se
-- qualquer passo falhar, a transação inteira volta, gatilho incluído.
-- Só o gatilho de data é desligado: produtos_slug_imutavel continua valendo.
--
-- Sem begin/commit: quem aplica (a transação desfeita da prova, ou a
-- aplicação em produção) abre a transação.
--
-- Desfazer (também preservando a data): o mesmo bloco com
--   set unidade_venda = null where nome in (...os 7 acima...)

set local lock_timeout = '2s';

alter table public.produtos disable trigger produtos_set_atualizado_em;

update public.produtos set unidade_venda = 'kg'
where nome = 'Bolo de Chocolate com Ninho' and unidade_venda is null;

update public.produtos set unidade_venda = 'unidade'
where nome in (
  'Morango Banhado',
  'Brigadeiro Gourmet',
  'Suco de Laranja Natural (1L)',
  'Beijinho',
  'Cento de docinho',
  'Cento de salgados sortidos'
) and unidade_venda is null;

alter table public.produtos enable trigger produtos_set_atualizado_em;
