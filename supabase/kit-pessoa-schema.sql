-- Kit Festa por pessoa (PR banco/kit-pessoa): dados da composição.
--
-- O produto de tipo kit_pessoa (produto-tipo-kit-pessoa.sql, aplicada antes)
-- é vendido por pessoa: produtos.preco é o valor por pessoa, produtos.
-- unidade_venda diz "a pessoa", e a quantidade do pedido é o número de
-- pessoas, sempre um dos tamanhos cadastrados. Estas tabelas guardam o resto:
--
--   kit_listas / kit_lista_itens  listas de opções NOMEADAS e COMPARTILHADAS
--                                 entre os kits (fritos, assados, doces,
--                                 sanduíches, recheios do bolo, bebidas). A
--                                 lista é editada uma vez e vale para todos
--                                 os produtos que a usam. Texto livre, sem
--                                 ligação com o catálogo de produtos nem com
--                                 public.recheios. "descricao" é opcional
--                                 (ex.: acréscimo a combinar no WhatsApp).
--   kit_grupos                    os grupos de escolha de um produto: escolha
--                                 única (recheio do bolo, bebida), distribuição
--                                 em passos (doces, fritos, assados,
--                                 sanduíches) ou fixo (sem escolha).
--   kit_tamanhos                  os tamanhos de um produto, em pessoas: kg de
--                                 bolo (meio em meio quilo) e se inclui
--                                 descartáveis.
--   kit_quantidades               por tamanho e grupo: o total a distribuir,
--                                 o máximo de sabores (nulo = sem limite) e,
--                                 quando o grupo é de escolha única, uma linha
--                                 por opção com a quantidade e o texto dela.
--
-- Migração puramente ADITIVA (CLAUDE.md): cinco tabelas novas, índices e
-- políticas. Nenhuma tabela existente é alterada. Nenhuma função nova (a
-- gravação em lote vem no PR do admin). Pode ir para produção antes do merge;
-- depende de produto-tipo-kit-pessoa.sql só para o produto existir com o tipo,
-- não para criar estas tabelas.
--
-- Limite aceito: o banco não confere que a opção de uma linha de
-- kit_quantidades pertence à lista do grupo, nem que o total de um grupo de
-- distribuição é múltiplo do passo. Isso é conferido pelo script de carga
-- (relatório de divergência) e pelo servidor.
--
-- Desfazer: kit-pessoa-schema-desfazer.sql.

set local lock_timeout = '2s';
set local statement_timeout = '10s';

-- ---------------------------------------------------------------------------
-- Listas compartilhadas

create table public.kit_listas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  criado_em timestamptz not null default now(),
  constraint kit_listas_nome_formato check (nome = btrim(nome) and char_length(nome) between 1 and 80)
);

create unique index kit_listas_nome_unico on public.kit_listas (lower(nome));

comment on table public.kit_listas is 'Listas de opções do Kit Festa por pessoa, compartilhadas entre os kits. Texto livre.';

create table public.kit_lista_itens (
  id uuid primary key default gen_random_uuid(),
  lista_id uuid not null references public.kit_listas(id) on delete cascade,
  nome text not null,
  descricao text,
  posicao smallint not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  constraint kit_lista_itens_nome_formato check (nome = btrim(nome) and char_length(nome) between 1 and 100),
  constraint kit_lista_itens_descricao_formato
    check (descricao is null or (descricao = btrim(descricao) and char_length(descricao) between 1 and 200)),
  constraint kit_lista_itens_posicao_faixa check (posicao between 1 and 200),
  -- Conferida só no fim da transação: permite trocar posições numa gravação em
  -- lote (mesmo padrão de produto_recheios).
  constraint kit_lista_itens_posicao_unica unique (lista_id, posicao) deferrable initially deferred
);

-- Item repetido na mesma lista, sem diferenciar maiúscula. A conferência sem
-- acento fica no código (não há a extensão unaccent).
create unique index kit_lista_itens_nome_unico on public.kit_lista_itens (lista_id, lower(nome));

comment on table public.kit_lista_itens is 'Itens de uma lista do Kit Festa por pessoa. Item inativo some da loja, mas fica na lista do admin.';

-- ---------------------------------------------------------------------------
-- Grupos, tamanhos e quantidades de cada produto

create table public.kit_grupos (
  produto_id uuid not null references public.produtos(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  chave text not null,
  rotulo text not null,
  modo text not null,
  lista_id uuid references public.kit_listas(id) on delete restrict,
  passo smallint,
  posicao smallint not null,
  constraint kit_grupos_pkey primary key (produto_id, id),
  constraint kit_grupos_chave_formato check (chave ~ '^[a-z][a-z0-9_]{0,29}$'),
  constraint kit_grupos_rotulo_formato check (rotulo = btrim(rotulo) and char_length(rotulo) between 1 and 60),
  constraint kit_grupos_modo_valido check (modo in ('escolha_unica', 'distribuicao', 'fixo')),
  constraint kit_grupos_posicao_faixa check (posicao between 1 and 20),
  -- fixo: sem lista nem passo; escolha única: lista, sem passo; distribuição:
  -- lista e passo.
  constraint kit_grupos_modo_coerente check (
    (modo = 'fixo' and lista_id is null and passo is null)
    or (modo = 'escolha_unica' and lista_id is not null and passo is null)
    or (modo = 'distribuicao' and lista_id is not null and passo is not null and passo between 1 and 100)
  ),
  constraint kit_grupos_chave_unica unique (produto_id, chave),
  constraint kit_grupos_posicao_unica unique (produto_id, posicao) deferrable initially deferred
);

create index kit_grupos_lista_idx on public.kit_grupos (lista_id);

comment on table public.kit_grupos is 'Grupos de escolha de um produto kit_pessoa: escolha única, distribuição em passos ou fixo.';

create table public.kit_tamanhos (
  produto_id uuid not null references public.produtos(id) on delete cascade,
  pessoas smallint not null,
  bolo_kg numeric(3, 1) not null,
  descartaveis boolean not null,
  constraint kit_tamanhos_pkey primary key (produto_id, pessoas),
  constraint kit_tamanhos_pessoas_faixa check (pessoas between 1 and 1000),
  -- Meio em meio quilo (1, 1,5, 2...).
  constraint kit_tamanhos_bolo_kg_valido check (bolo_kg > 0 and bolo_kg * 2 = trunc(bolo_kg * 2))
);

comment on table public.kit_tamanhos is 'Tamanhos (em pessoas) de um produto kit_pessoa. A quantidade do pedido é sempre um destes valores.';

create table public.kit_quantidades (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null,
  pessoas smallint not null,
  grupo_id uuid not null,
  -- Nulo nos grupos de distribuição e fixos; preenchido, uma linha por opção
  -- nos grupos de escolha única que variam por opção (bebida).
  opcao_id uuid references public.kit_lista_itens(id) on delete cascade,
  total integer not null,
  max_sabores smallint,
  rotulo text,
  constraint kit_quantidades_total_faixa check (total > 0 and total <= 100000),
  constraint kit_quantidades_max_sabores_faixa check (max_sabores is null or max_sabores > 0),
  constraint kit_quantidades_rotulo_formato
    check (rotulo is null or (rotulo = btrim(rotulo) and char_length(rotulo) between 1 and 80)),
  constraint kit_quantidades_tamanho_fkey
    foreign key (produto_id, pessoas) references public.kit_tamanhos (produto_id, pessoas) on delete cascade,
  constraint kit_quantidades_grupo_fkey
    foreign key (produto_id, grupo_id) references public.kit_grupos (produto_id, id) on delete cascade
);

-- Uma linha por tamanho, grupo e opção (opção nula conta como uma só).
create unique index kit_quantidades_chave on public.kit_quantidades
  (produto_id, pessoas, grupo_id, coalesce(opcao_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index kit_quantidades_grupo_idx on public.kit_quantidades (produto_id, grupo_id);
create index kit_quantidades_opcao_idx on public.kit_quantidades (opcao_id) where opcao_id is not null;

comment on table public.kit_quantidades is 'Total a distribuir (ou quantidade por opção) de cada grupo, por tamanho de um produto kit_pessoa.';

-- ---------------------------------------------------------------------------
-- Permissões: anônimo só lê; logado lê e escreve; ninguém trunca (TRUNCATE
-- ignora a RLS). A tabela nova nasce com todas as permissões para anon e
-- authenticated: aqui sai o que o papel não precisa.

revoke all on public.kit_listas, public.kit_lista_itens, public.kit_grupos, public.kit_tamanhos, public.kit_quantidades
  from anon, authenticated;
grant select on public.kit_listas, public.kit_lista_itens, public.kit_grupos, public.kit_tamanhos, public.kit_quantidades
  to anon;
grant select, insert, update, delete
  on public.kit_listas, public.kit_lista_itens, public.kit_grupos, public.kit_tamanhos, public.kit_quantidades
  to authenticated;

-- ---------------------------------------------------------------------------
-- RLS. O anônimo só enxerga o que pertence a produto ativo (mesmo modelo de
-- produto_recheios e produto_fotos); o filtro de item ativo da lista também
-- fica na política. O logado enxerga e altera tudo.

alter table public.kit_listas enable row level security;
alter table public.kit_lista_itens enable row level security;
alter table public.kit_grupos enable row level security;
alter table public.kit_tamanhos enable row level security;
alter table public.kit_quantidades enable row level security;

create policy "Anonimo le grupos de produto ativo"
  on public.kit_grupos for select to anon
  using (exists (select 1 from public.produtos p where p.id = kit_grupos.produto_id and p.ativo = true));

create policy "Anonimo le tamanhos de produto ativo"
  on public.kit_tamanhos for select to anon
  using (exists (select 1 from public.produtos p where p.id = kit_tamanhos.produto_id and p.ativo = true));

create policy "Anonimo le quantidades de produto ativo"
  on public.kit_quantidades for select to anon
  using (exists (select 1 from public.produtos p where p.id = kit_quantidades.produto_id and p.ativo = true));

create policy "Anonimo le lista usada por produto ativo"
  on public.kit_listas for select to anon
  using (exists (
    select 1 from public.kit_grupos g
    join public.produtos p on p.id = g.produto_id
    where g.lista_id = kit_listas.id and p.ativo = true
  ));

create policy "Anonimo le item ativo de lista usada por produto ativo"
  on public.kit_lista_itens for select to anon
  using (
    ativo = true
    and exists (
      select 1 from public.kit_grupos g
      join public.produtos p on p.id = g.produto_id
      where g.lista_id = kit_lista_itens.lista_id and p.ativo = true
    )
  );

create policy "Autenticado le todas as listas do kit"
  on public.kit_listas for select to authenticated using (true);
create policy "Autenticado le todos os itens de lista do kit"
  on public.kit_lista_itens for select to authenticated using (true);
create policy "Autenticado le todos os grupos do kit"
  on public.kit_grupos for select to authenticated using (true);
create policy "Autenticado le todos os tamanhos do kit"
  on public.kit_tamanhos for select to authenticated using (true);
create policy "Autenticado le todas as quantidades do kit"
  on public.kit_quantidades for select to authenticated using (true);

create policy "Somente autenticado insere lista do kit"
  on public.kit_listas for insert to authenticated with check (true);
create policy "Somente autenticado edita lista do kit"
  on public.kit_listas for update to authenticated using (true) with check (true);
create policy "Somente autenticado apaga lista do kit"
  on public.kit_listas for delete to authenticated using (true);

create policy "Somente autenticado insere item de lista do kit"
  on public.kit_lista_itens for insert to authenticated with check (true);
create policy "Somente autenticado edita item de lista do kit"
  on public.kit_lista_itens for update to authenticated using (true) with check (true);
create policy "Somente autenticado apaga item de lista do kit"
  on public.kit_lista_itens for delete to authenticated using (true);

create policy "Somente autenticado insere grupo do kit"
  on public.kit_grupos for insert to authenticated with check (true);
create policy "Somente autenticado edita grupo do kit"
  on public.kit_grupos for update to authenticated using (true) with check (true);
create policy "Somente autenticado apaga grupo do kit"
  on public.kit_grupos for delete to authenticated using (true);

create policy "Somente autenticado insere tamanho do kit"
  on public.kit_tamanhos for insert to authenticated with check (true);
create policy "Somente autenticado edita tamanho do kit"
  on public.kit_tamanhos for update to authenticated using (true) with check (true);
create policy "Somente autenticado apaga tamanho do kit"
  on public.kit_tamanhos for delete to authenticated using (true);

create policy "Somente autenticado insere quantidade do kit"
  on public.kit_quantidades for insert to authenticated with check (true);
create policy "Somente autenticado edita quantidade do kit"
  on public.kit_quantidades for update to authenticated using (true) with check (true);
create policy "Somente autenticado apaga quantidade do kit"
  on public.kit_quantidades for delete to authenticated using (true);
