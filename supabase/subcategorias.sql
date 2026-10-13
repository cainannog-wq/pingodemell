-- Subcategorias: segundo nível dentro de uma categoria (Bolos, Doces,
-- Salgados, Kit Festa) para a Lista pública. PR 1: só o banco. Nenhuma tela,
-- filtro ou carga de produtos; todo produto continua com subcategoria_id nulo.
--
-- Categoria da migração (CLAUDE.md): cria tabela e coluna opcional (aditivo),
-- mas também uma chave estrangeira e um gatilho de UPDATE em public.produtos,
-- com SHARE ROW EXCLUSIVE durante o ALTER. EXCEÇÃO CONSCIENTE à regra de só
-- aditiva: aplicar antes do merge só com ok explícito do Cainan.
--
-- Sem begin/commit próprios (o ensaio roda dentro de uma transação desfeita).
-- A aplicação real usa uma conexão só, com o lock_timeout curto abaixo.
--
-- Desenho:
--   * Chave estrangeira composta (subcategoria_id, "Categoria") apontando para
--     subcategorias (id, categoria): o produto só pode apontar para uma
--     subcategoria da PRÓPRIA categoria. match simple: subcategoria_id nulo
--     (todos hoje) não é conferido. on delete/update restrict: subcategoria
--     em uso não se apaga nem muda de categoria (desativar é permitido).
--   * Gatilho produtos_limpa_subcategoria: trocar a categoria do produto sem
--     informar subcategoria zera a subcategoria (a antiga seria de outra
--     categoria). Quem troca categoria e subcategoria no mesmo UPDATE mantém a
--     nova; a chave composta recusa combinação inválida.
--   * Slug gerado e travado no banco, único dentro da categoria (mesma regra de
--     produtos: produto_slug_base, sufixo -2, -3...). Nome único na categoria,
--     sem diferenciar maiúscula.
--   * ordem: sem padrão. Subcategoria nova entra no fim da categoria: o
--     gatilho de cadastro preenche max(ordem) + 10 (categoria vazia: 10)
--     quando ela vem nula. Duas criadas ao mesmo tempo podem empatar;
--     desempate por nome, aceito.
--   * Sem check limitando as categorias aceitas (decisão do Cainan).
--   * RLS no modelo de public.recheios: anônimo lê só ativo; authenticated
--     lê e escreve tudo. TRUNCATE sai de todos (ignora a RLS).
--   * Funções novas nascem sem EXECUTE para public, anon e authenticated.
--
-- Desfazer: supabase/subcategorias-desfazer.sql (só enquanto nenhum produto
-- tiver subcategoria_id preenchido).

set local lock_timeout = '2s';

create table public.subcategorias (
  id uuid primary key default gen_random_uuid(),
  categoria public.categoria_produto not null,
  nome text not null,
  slug text not null,
  ordem integer not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  constraint subcategorias_nome_formato check (nome = btrim(nome) and length(nome) between 1 and 80),
  constraint subcategorias_slug_formato check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint subcategorias_ordem_positiva check (ordem >= 0),
  constraint subcategorias_id_categoria_key unique (id, categoria),
  constraint subcategorias_categoria_slug_key unique (categoria, slug)
);

create unique index subcategorias_categoria_nome_key on public.subcategorias (categoria, lower(nome));

comment on table public.subcategorias is 'Segundo nível de categoria da Lista pública. Slug gerado e travado pelo banco, único dentro da categoria. ordem sem padrão: nula no insert vira o fim da categoria.';

create function public.subcategoria_slug_livre(p_categoria public.categoria_produto, p_nome text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_base text := public.produto_slug_base(p_nome);
  v_slug text := v_base;
  v_n int := 1;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('subcategorias.slug:' || p_categoria::text || ':' || v_base));
  while exists (select 1 from public.subcategorias where categoria = p_categoria and slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;
  return v_slug;
end;
$$;

-- DEFINER: a busca de colisão e do maior ordem enxerga todas as linhas,
-- qualquer que seja o papel de quem cadastra.
create function public.subcategorias_slug_no_cadastro()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.slug is null or new.slug = '' then
    new.slug := public.subcategoria_slug_livre(new.categoria, new.nome);
  end if;
  if new.ordem is null then
    select coalesce(max(s.ordem), 0) + 10 into new.ordem
    from public.subcategorias s
    where s.categoria = new.categoria;
  end if;
  return new;
end;
$$;

create function public.subcategorias_slug_imutavel()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.slug is distinct from old.slug then
    raise exception 'O endereço (slug) da subcategoria "%" é fixo e não pode mudar: continua "%".', old.nome, old.slug
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create function public.produtos_limpa_subcategoria()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new."Categoria" is distinct from old."Categoria"
     and new.subcategoria_id is not distinct from old.subcategoria_id then
    new.subcategoria_id := null;
  end if;
  return new;
end;
$$;

revoke execute on function public.subcategoria_slug_livre(public.categoria_produto, text) from public, anon, authenticated;
revoke execute on function public.subcategorias_slug_no_cadastro() from public, anon, authenticated;
revoke execute on function public.subcategorias_slug_imutavel() from public, anon, authenticated;
revoke execute on function public.produtos_limpa_subcategoria() from public, anon, authenticated;

create trigger subcategorias_slug_no_cadastro
  before insert on public.subcategorias
  for each row execute function public.subcategorias_slug_no_cadastro();

create trigger subcategorias_slug_imutavel
  before update on public.subcategorias
  for each row execute function public.subcategorias_slug_imutavel();

alter table public.subcategorias enable row level security;

create policy "Anonimo le so subcategoria ativa"
  on public.subcategorias for select to anon using (ativo = true);
create policy "Autenticado le todas as subcategorias"
  on public.subcategorias for select to authenticated using (true);
create policy "Somente autenticado insere subcategoria"
  on public.subcategorias for insert to authenticated with check (true);
create policy "Somente autenticado edita subcategoria"
  on public.subcategorias for update to authenticated using (true) with check (true);
create policy "Somente autenticado apaga subcategoria"
  on public.subcategorias for delete to authenticated using (true);

revoke all on table public.subcategorias from public, anon, authenticated;
grant select on table public.subcategorias to anon;
grant select, insert, update, delete on table public.subcategorias to authenticated;

-- Em produtos: coluna opcional, chave composta, índice e gatilho.
alter table public.produtos add column subcategoria_id uuid;

alter table public.produtos add constraint produtos_subcategoria_fkey
  foreign key (subcategoria_id, "Categoria") references public.subcategorias (id, categoria)
  match simple on delete restrict on update restrict;

create index produtos_subcategoria_idx on public.produtos (subcategoria_id, "Categoria");

create trigger produtos_limpa_subcategoria
  before update of "Categoria" on public.produtos
  for each row execute function public.produtos_limpa_subcategoria();

-- Semente: 21 subcategorias (4 + 7 + 4 + 6), ordem de 10 em 10.
insert into public.subcategorias (categoria, nome, ordem) values
  ('Bolos', 'Tradicional', 10),
  ('Bolos', 'Caseirinhos', 20),
  ('Bolos', 'Decorados', 30),
  ('Bolos', 'Smash Cake', 40),
  ('Doces', 'Tradicionais', 10),
  ('Doces', 'Gourmet', 20),
  ('Doces', 'Gourmet Premium', 30),
  ('Doces', 'Finos', 40),
  ('Doces', 'Personalizados', 50),
  ('Doces', 'Personalizados Combo', 60),
  ('Doces', 'Donuts', 70),
  ('Salgados', 'Fritos', 10),
  ('Salgados', 'Assados', 20),
  ('Salgados', 'Finos e Assados', 30),
  ('Salgados', 'Congelados', 40),
  ('Kit Festa', 'Básico', 10),
  ('Kit Festa', 'Clássico', 20),
  ('Kit Festa', 'Premium', 30),
  ('Kit Festa', 'Escolar', 40),
  ('Kit Festa', 'Mini Wedding', 50),
  ('Kit Festa', 'Outros', 60);
