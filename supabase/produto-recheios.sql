-- Recheios personalizados por produto (Bolos de tipo normal e Bento Cake).
--
-- Cada produto pode ter a sua própria lista de recheios, em texto livre e sem
-- ligação com o catálogo public.recheios. O produto tem recheios
-- personalizados quando tem linhas nesta tabela (não existe coluna de
-- interruptor: lista vazia = desligado). O preço do produto não muda com o
-- recheio.
--
-- Migração puramente ADITIVA (CLAUDE.md): cria uma tabela nova, as políticas
-- dela, uma função e copia dados para a tabela nova. Nada existente é
-- alterado: public.recheios (inclusive vale_bento) e public.produtos ficam
-- intactos, porque a produção continua lendo o catálogo enquanto o PR está em
-- homologação. Pode ir para produção antes do merge.
--
-- Cópia do Bento Cake: cada produto de tipo bento_cake recebe, em ordem
-- alfabética, os recheios hoje ativos e marcados com vale_bento no catálogo.
-- O id da linha copiada é o id do recheio do catálogo (a chave é
-- produto_id + id), então um carrinho guardado no navegador antes do deploy
-- continua batendo com a lista nova.
--
-- Desfazer (se um dia for preciso): drop function
-- public.salvar_produto_recheios(uuid, jsonb); drop table
-- public.produto_recheios;

create table public.produto_recheios (
  produto_id uuid not null references public.produtos(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  nome text not null,
  posicao smallint not null,
  criado_em timestamptz not null default now(),
  constraint produto_recheios_pkey primary key (produto_id, id),
  constraint produto_recheios_nome_formato
    check (nome = btrim(nome) and char_length(nome) between 1 and 100),
  constraint produto_recheios_posicao_faixa check (posicao between 1 and 100),
  -- Conferida só no fim da transação: permite trocar posições dentro de
  -- salvar_produto_recheios.
  constraint produto_recheios_posicao_unica unique (produto_id, posicao) deferrable initially deferred
);

-- Recheio repetido no mesmo produto, sem diferenciar maiúscula. A conferência
-- sem acento fica no código (não há a extensão unaccent).
create unique index produto_recheios_nome_unico on public.produto_recheios (produto_id, lower(nome));

comment on table public.produto_recheios is 'Recheios personalizados de um produto (Bolos de tipo normal e Bento Cake): texto livre, sem ligação com public.recheios. Lista vazia = o produto não tem recheio a escolher. Não muda o preço.';

alter table public.produto_recheios enable row level security;

-- Anônimo só lê; authenticated escreve. TRUNCATE ignora a RLS, então sai de
-- todos.
revoke insert, update, delete, truncate on public.produto_recheios from anon;
revoke truncate on public.produto_recheios from authenticated;

create policy "Anonimo le recheios de produto ativo"
  on public.produto_recheios for select
  to anon
  using (exists (
    select 1 from public.produtos p
    where p.id = produto_recheios.produto_id and p.ativo = true
  ));

create policy "Autenticado le todos os recheios de produto"
  on public.produto_recheios for select
  to authenticated
  using (true);

create policy "Somente autenticado insere recheio de produto"
  on public.produto_recheios for insert
  to authenticated
  with check (true);

create policy "Somente autenticado edita recheio de produto"
  on public.produto_recheios for update
  to authenticated
  using (true)
  with check (true);

create policy "Somente autenticado apaga recheio de produto"
  on public.produto_recheios for delete
  to authenticated
  using (true);

-- Grava a lista inteira de um produto numa transação: troca tudo pela lista
-- recebida, na ordem recebida. p_recheios: [{"id": uuid opcional, "nome": text}].
-- O id existente é mantido (o carrinho de quem já escolheu continua batendo).
-- Lista vazia apaga tudo (interruptor desligado).
--
-- SECURITY INVOKER: a RLS vale aqui dentro. Executável só por authenticated.
create function public.salvar_produto_recheios(p_produto_id uuid, p_recheios jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_recheios is null or jsonb_typeof(p_recheios) <> 'array' then
    raise exception 'Lista de recheios inválida.';
  end if;
  if jsonb_array_length(p_recheios) > 100 then
    raise exception 'Limite de 100 recheios por produto.' using errcode = 'check_violation';
  end if;

  delete from public.produto_recheios where produto_id = p_produto_id;

  insert into public.produto_recheios (produto_id, id, nome, posicao)
  select p_produto_id,
         coalesce((x.e->>'id')::uuid, gen_random_uuid()),
         x.e->>'nome',
         x.ord
  from jsonb_array_elements(p_recheios) with ordinality as x(e, ord);
end;
$$;

revoke execute on function public.salvar_produto_recheios(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.salvar_produto_recheios(uuid, jsonb) to authenticated;

-- Cópia dos recheios do Bento Cake (ver o cabeçalho).
insert into public.produto_recheios (produto_id, id, nome, posicao)
select p.id, r.id, r.nome,
       row_number() over (partition by p.id order by lower(r.nome), r.nome)
from public.produtos p
cross join public.recheios r
where p.tipo = 'bento_cake'
  and r.ativo = true
  and r.vale_bento = true;
