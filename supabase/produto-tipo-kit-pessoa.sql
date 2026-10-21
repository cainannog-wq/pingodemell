-- Tipo "kit_pessoa" (PR banco/kit-pessoa): quinto valor (no fim da ordem)
-- do enum produto_tipo. É o kit de festa vendido por pessoa (Kit Festa
-- Básico, Clássico e Premium), com tamanho em pessoas e grupos de escolha.
--
-- Mesma classificação de produto-tipo-bolo-bento.sql e categoria-adicionais.sql:
-- valor novo de enum muda um tipo em uso, mas não altera nem invalida nenhuma
-- linha existente (tratado como aditivo). Aplicada em produção antes do merge,
-- só com o ok escrito do Cainan.
-- Status: ver docs/status-pingo-de-mell.md (tabela de migrações).
--
-- O Postgres aceita ADD VALUE dentro de transação, mas o valor novo só pode
-- ser USADO depois do commit: nada aqui usa o valor, e o primeiro produto
-- desse tipo nasce em outra transação. Por isso esta migração é um arquivo
-- à parte, aplicada antes de kit-pessoa-schema.sql.
--
-- Sem desfazer limpo: o Postgres não remove valor de enum. Ver
-- produto-tipo-kit-pessoa-desfazer.sql.

set local lock_timeout = '2s';
set local statement_timeout = '10s';

alter type public.produto_tipo add value if not exists 'kit_pessoa';
