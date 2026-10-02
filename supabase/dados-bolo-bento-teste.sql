-- Dados de DEMONSTRAÇÃO do PR bolo-bento (fictícios, marcados "(demo)" no
-- nome, saem antes da carga real): recheios, um Smash Cake e dois Bento
-- Cake, mais a passagem do "Bolo de Chocolate com Ninho" para o tipo Bolo.
-- Autorizado pelo Cainan em 28/09/2026 (recheios de demonstração; produtos
-- de demonstração; "pode fazer o upgrade do bolo").
--
-- NÃO é migração de schema: só dados. Grava em produção, por isso só com o
-- ok do Cainan, depois da prova em transação desfeita:
--   node scripts/banco/bolo-bento-dados.mjs
-- e só depois de aplicados os enums e a tabela (categoria-bento-cake.sql,
-- produto-tipo-bolo-bento.sql, recheios-schema.sql).
--
-- Recheios (catálogo único):
--   Brigadeiro, Ninho com morango          → Bolo grande e Bento Cake
--   Doce de leite, Abacaxi com coco        → só Bolo grande
--   Ninho, Prestígio                       → só Bento Cake
-- Produtos: "Smash Cake (demo)" é um produto normal em Bolos (avulso);
-- "Bento Cake Flork (demo)" e "Bento Cake Mesversário (demo)" são tipo
-- bento_cake na categoria Bento Cake.
--
-- atualizado_em do Bolo preservado: o gatilho produtos_set_atualizado_em
-- grava a hora atual em todo update (e "Os mais pedidos" da Home ordena por
-- essa data). O papel postgres não pode usar session_replication_role, então
-- o gatilho é desligado só dentro desta transação e religado no fim; se
-- qualquer passo falhar, a transação inteira volta, gatilho incluído. Só o
-- gatilho de data é desligado: produtos_slug_imutavel continua valendo.
--
-- Sem begin/commit: quem aplica (a transação desfeita da prova, ou a
-- aplicação em produção) abre a transação.
--
-- Desfazer (recheios e produtos de demonstração, e o Bolo de volta ao normal):
--   delete from public.recheios where nome like '% (demo)';
--   delete from public.produtos where nome in ('Smash Cake (demo)', 'Bento Cake Flork (demo)', 'Bento Cake Mesversário (demo)');
--   (com o gatilho de data desligado) update public.produtos set tipo = 'normal' where nome = 'Bolo de Chocolate com Ninho';

set local lock_timeout = '2s';

insert into public.recheios (nome, vale_bolo, vale_bento, preco_kg, grupo) values
  ('Brigadeiro (demo)', true, true, 80.00, 'chocolate_outros'),
  ('Ninho com morango (demo)', true, true, 95.00, 'frutas'),
  ('Doce de leite (demo)', true, false, 75.00, 'chocolate_outros'),
  ('Abacaxi com coco (demo)', true, false, 70.00, 'frutas'),
  ('Ninho (demo)', false, true, null, null),
  ('Prestígio (demo)', false, true, null, null)
on conflict do nothing;

insert into public.produtos (nome, preco, pedido_minimo, tipo, ativo, destaque, "Categoria", descricao, prazo_producao_dias) values
  ('Smash Cake (demo)', 70.00, 1, 'normal', true, false, 'Bolos', 'Bolinho individual para o primeiro aniversário, pronto para "atacar". Peso fechado, sem escolha de recheio.', 2),
  ('Bento Cake Flork (demo)', 60.00, 1, 'bento_cake', true, true, 'Bento Cake', 'Bento Cake com o tema Flork. Escolha o recheio.', 2),
  ('Bento Cake Mesversário (demo)', 65.00, 1, 'bento_cake', true, false, 'Bento Cake', 'Bento Cake para o mesversário, com topo personalizado. Escolha o recheio.', 2)
on conflict (nome) do nothing;

alter table public.produtos disable trigger produtos_set_atualizado_em;

update public.produtos set tipo = 'bolo'
where nome = 'Bolo de Chocolate com Ninho' and tipo = 'normal';

alter table public.produtos enable trigger produtos_set_atualizado_em;
