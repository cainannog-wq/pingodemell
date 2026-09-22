-- Extensão do cadastro de produto no CMS: prazo de produção, step de
-- quantidade, destaque, status ativo/inativo e a categoria "Bebidas".
--
-- Já aplicado em produção via MCP do Supabase (mesmo projeto de sempre).
-- Este arquivo fica no repositório só como registro do schema, seguindo o
-- padrão dos outros .sql desta pasta (pedidos-schema.sql, etc.).
--
-- Todas as colunas novas são NOT NULL com default, para não quebrar os
-- produtos já cadastrados: prazo_producao_dias = 1, step_quantidade =
-- 'livre', destaque = false, ativo = true. Nenhum desses campos tem efeito
-- no catálogo público, carrinho ou checkout ainda — só existem no CMS
-- nesta etapa.

-- A tabela produtos já tinha uma coluna "Categoria" (categoria_produto:
-- Doces, Salgados, Bolos), criada fora do controle deste repositório e
-- nunca exposta no formulário até agora. Este trabalho adiciona "Bebidas"
-- à lista e passa a expor o campo no CMS.
alter type public.categoria_produto add value if not exists 'Bebidas';

create type public.produto_step_quantidade as enum ('livre', 'multiplos_5', 'multiplos_10');

alter table public.produtos
  add column prazo_producao_dias integer not null default 1 check (prazo_producao_dias > 0),
  add column step_quantidade public.produto_step_quantidade not null default 'livre',
  add column destaque boolean not null default false,
  add column ativo boolean not null default true;

comment on column public.produtos.prazo_producao_dias is 'Prazo de produção em dias, editável no CMS.';
comment on column public.produtos.step_quantidade is 'Passo de incremento de quantidade aceito no pedido (livre, múltiplos de 5 ou de 10). Ainda sem efeito no carrinho público.';
comment on column public.produtos.destaque is 'Produto marcado como destaque no CMS. Ainda sem efeito no catálogo público.';
comment on column public.produtos.ativo is 'Status do produto no CMS (ativo/inativo). Ainda sem efeito no catálogo público.';
