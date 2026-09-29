-- Tipos "bolo" e "bento_cake" (PR bolo-bento): dois valores novos do enum
-- produto_tipo (hoje: normal, cento).
--
-- - bolo: tamanho em kg, recheio do catálogo (recheios.vale_bolo), preço =
--   R$/kg do recheio × kg. O campo "Preço" do cadastro não vale.
-- - bento_cake: recheio informativo do catálogo (recheios.vale_bento), preço
--   fixo do produto-tema.
-- O Smash Cake NÃO ganha tipo: é um produto "normal" em Bolos (avulso).
--
-- Isolada numa migração própria (o Postgres não deixa usar um valor novo de
-- enum na mesma transação em que ele foi criado). Mesma classificação do
-- categoria-kits.sql e do categoria-bento-cake.sql: valor novo de enum,
-- não altera nem invalida nenhuma linha. Só é aplicada em produção com o
-- ok do Cainan para esta instrução.
--
-- Sem desfazer limpo: o Postgres não remove valor de enum.
--
-- Risco conhecido até o lote chegar à main: o admin de produção (main) não
-- conhece esses tipos; abrir e salvar ali um produto 'bolo' ou 'bento_cake'
-- grava 'normal' sem avisar.

alter type public.produto_tipo add value 'bolo';
alter type public.produto_tipo add value 'bento_cake';
