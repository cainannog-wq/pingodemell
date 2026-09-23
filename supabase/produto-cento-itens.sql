-- Tipo de produto "Cento": produto com uma lista de subitens (sabores) que
-- referenciam produtos reais do catálogo, não texto livre.
--
-- Já aplicado em produção via MCP do Supabase (mesmo projeto de sempre).
-- Este arquivo fica no repositório só como registro do schema, seguindo o
-- padrão dos outros .sql desta pasta (produtos-campos-cms.sql, etc.).
--
-- Migração puramente aditiva: coluna "tipo" nova em produtos (enum com
-- default 'normal', não quebra produto já cadastrado) + tabela nova
-- produto_cento_itens. Aplicada antes do merge do PR, seguindo a regra
-- fechada com o Cainan em 22/09/2026 (ver CLAUDE.md).
--
-- Quantidade de um cento é sempre fixa em 100 por unidade — não existe
-- campo de quantidade editável nesse tipo de produto, nem no banco nem no
-- formulário.

create type public.produto_tipo as enum ('normal', 'cento');

alter table public.produtos
  add column tipo public.produto_tipo not null default 'normal';

comment on column public.produtos.tipo is 'Tipo de produto: "normal" (produto comum) ou "cento" (produto com lista de subitens/sabores referenciando outros produtos reais). Quantidade de um cento é sempre fixa em 100, sem campo próprio no formulário.';

-- on update cascade: como a PK de produtos é "nome" (texto, editável no
-- CRUD), renomear um produto precisa propagar automaticamente para as
-- referências aqui, sem exigir lógica extra na Server Action.
-- on delete cascade: se o produto "cento" for excluído, seus subitens
-- somem junto; se um produto usado como subitem for excluído, a
-- referência específica some (o cento não fica com linha órfã apontando
-- pra um nome que não existe mais). Isso é diferente de "inativo", que a
-- regra de negócio pede pra manter na lista com aviso visual até remoção
-- manual — aqui a linha só desaparece quando o produto é apagado de
-- verdade, não quando só é marcado como inativo.
create table public.produto_cento_itens (
  id uuid primary key default gen_random_uuid(),
  cento_nome text not null references public.produtos(nome) on update cascade on delete cascade,
  subitem_nome text not null references public.produtos(nome) on update cascade on delete cascade,
  ordem integer not null default 0,
  criado_em timestamptz not null default now(),
  constraint produto_cento_itens_sem_autorreferencia check (cento_nome <> subitem_nome),
  constraint produto_cento_itens_sem_duplicata unique (cento_nome, subitem_nome)
);

comment on table public.produto_cento_itens is 'Subitens (sabores) de um produto tipo "cento", cada um referenciando um produto real do catálogo. Se o produto referenciado for marcado inativo, a linha continua aqui até o admin remover manualmente (o CMS mostra aviso visual, sem bloquear).';

create index produto_cento_itens_cento_nome_idx on public.produto_cento_itens (cento_nome);
create index produto_cento_itens_subitem_nome_idx on public.produto_cento_itens (subitem_nome);

alter table public.produto_cento_itens enable row level security;

-- Mesmo padrão de RLS de produtos: leitura pública, escrita restrita a
-- usuário autenticado do CMS.
create policy "Leitura publica de itens de cento"
  on public.produto_cento_itens for select
  to public
  using (true);

create policy "Somente autenticado insere item de cento"
  on public.produto_cento_itens for insert
  to authenticated
  with check (true);

create policy "Somente autenticado edita item de cento"
  on public.produto_cento_itens for update
  to authenticated
  using (true);

create policy "Somente autenticado apaga item de cento"
  on public.produto_cento_itens for delete
  to authenticated
  using (true);
