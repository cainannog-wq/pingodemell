-- Troca o texto "Mande sua foto de inspiração." das descrições de 6 produtos
-- pelo texto pedido pela Taami em 23/10/2026:
--   "Você pode mandar sua foto de inspiração, na Pingo de Mell trabalhamos
--    com todos os temas!"
-- Hoje a frase é "...Mande sua foto de inspiração. Na Pingo de Mell
-- trabalhamos com todos os temas!" nesses 6 produtos (outros 19 já têm o
-- texto novo): Bolo Ganache, Bolo Ganache personalizado, Bolo Morango com
-- suspiro, Bolo Naked e Number Cakes, Bolo Pasta americana e Bolo tradicional
-- (recheio à escolha).
--
-- NÃO é migração de schema: só dados (a descrição mora no banco, não no
-- código). NÃO APLICADO. Grava em produção, por isso só com o ok do Cainan.
-- Trocar só a frase, com replace: o resto de cada descrição fica como está.
--
-- atualizado_em preservado, como em dados-unidade-venda-teste.sql: o gatilho
-- produtos_set_atualizado_em é desligado só dentro da transação (que quem
-- aplica abre) e religado no fim. Sem begin/commit aqui.
--
-- A vitrine guarda os produtos por até 24 horas: depois de aplicar, salvar
-- qualquer produto no admin (ou um deploy) para a interna mostrar o texto novo.
--
-- Desfazer: o replace ao contrário, no mesmo bloco.

set local lock_timeout = '2s';

alter table public.produtos disable trigger produtos_set_atualizado_em;

update public.produtos
set descricao = replace(
  descricao,
  'Mande sua foto de inspiração. Na Pingo de Mell trabalhamos com todos os temas!',
  'Você pode mandar sua foto de inspiração, na Pingo de Mell trabalhamos com todos os temas!'
)
where descricao like '%Mande sua foto de inspiração. Na Pingo de Mell trabalhamos com todos os temas!%';

alter table public.produtos enable trigger produtos_set_atualizado_em;
