-- Categoria "Adicionais" (PR fase4/categorias-novas): sétimo valor do enum
-- categoria_produto. Produto de venda simples (tipo normal, por unidade),
-- sem comportamento próprio.
--
-- Mesma classificação de categoria-kits.sql e categoria-bento-cake.sql:
-- valor novo de enum muda um tipo em uso, mas não altera nem invalida
-- nenhuma linha existente (tratado como aditivo). Aplicada em produção
-- antes do merge, só com o ok do Cainan.
-- Status: ver docs/status-pingo-de-mell.md (tabela de migrações).
--
-- O Postgres aceita ADD VALUE dentro de transação, mas o valor novo só pode
-- ser USADO depois do commit: nada aqui usa o valor, e o primeiro produto
-- nessa categoria nasce em outra transação.
--
-- Sem desfazer limpo: o Postgres não remove valor de enum. Ver
-- categoria-adicionais-desfazer.sql.

set local lock_timeout = '2s';
set local statement_timeout = '10s';

alter type public.categoria_produto add value if not exists 'Adicionais';
