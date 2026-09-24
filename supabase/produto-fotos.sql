-- Galeria de fotos extras do produto (além da capa, que continua em
-- produtos.image_url, sem mudança).
--
-- Migração puramente ADITIVA: cria a tabela produto_fotos, as políticas de
-- RLS dela, duas funções e um gatilho nessa tabela nova. Nada existente é
-- alterado (nem produtos, nem storage.objects). Pela regra do CLAUDE.md,
-- pode ir para produção antes do merge.
-- Status: JÁ APLICADA em produção via MCP do Supabase, como migração
-- 20260924152541 "produto_fotos", em 24/09/2026 às 15:25:41 UTC (antes do
-- merge do PR galeria-admin), com lock_timeout de 2s. O conteúdo aplicado
-- é exatamente este arquivo (só esta linha de status mudou depois).
-- Provada antes numa transação desfeita e conferida depois da aplicação
-- (políticas, permissões, funções, gatilho, chamadas HTTP anônimas
-- recusadas) — ver descrição do PR.
--
-- Arquivos: bucket público "Pingo de Mell", pasta galeria/{produto_id}/,
-- nome {uuid}.webp ou {uuid}.jpg (o navegador reduz e converte antes de
-- subir). O caminho é montado no servidor; a restrição
-- produto_fotos_caminho_na_pasta garante no banco que ele fica dentro da
-- pasta do próprio produto.
--
-- Limite: 9 fotos extras por produto (10 com a capa). O gatilho
-- produto_fotos_limite dá a mensagem clara; posição de 1 a 9 + posição
-- única por produto garantem o limite mesmo com dois salvamentos ao
-- mesmo tempo.
--
-- Limite aceito: a política de leitura esconde a LISTA de fotos de produto
-- inativo, não os arquivos — quem já tem o link do arquivo continua
-- abrindo, como acontece com a capa.

create table public.produto_fotos (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references public.produtos(id) on delete cascade,
  caminho text not null,
  posicao smallint not null,
  criado_em timestamptz not null default now(),
  constraint produto_fotos_caminho_unico unique (caminho),
  constraint produto_fotos_posicao_faixa check (posicao between 1 and 9),
  constraint produto_fotos_caminho_na_pasta
    check (caminho ~ ('^galeria/' || produto_id::text || '/[0-9a-f-]{36}\.(webp|jpg)$')),
  -- Conferida só no fim da transação: permite trocar posições (ex.: 1 com
  -- 3) dentro de salvar_produto_fotos sem esbarrar nela no meio da troca.
  constraint produto_fotos_posicao_unica unique (produto_id, posicao) deferrable initially deferred
);

comment on table public.produto_fotos is 'Fotos extras (galeria) de um produto, além da capa em produtos.image_url. Máximo 9 por produto. Arquivo no bucket "Pingo de Mell", pasta galeria/{produto_id}/.';
comment on column public.produto_fotos.caminho is 'Caminho do arquivo dentro do bucket "Pingo de Mell": galeria/{produto_id}/{uuid}.webp|jpg.';
comment on column public.produto_fotos.posicao is 'Ordem na galeria, de 1 a 9 (a capa não conta: ela é sempre a primeira foto do produto).';

alter table public.produto_fotos enable row level security;

-- Defesa extra além da RLS: o anônimo nem tem o privilégio de escrever na
-- tabela (a RLS já bloquearia). TRUNCATE ignora RLS, então sai de todos.
revoke insert, update, delete, truncate on public.produto_fotos from anon;
revoke truncate on public.produto_fotos from authenticated;

-- Condição de ativo escrita aqui mesmo, sem depender só da RLS de produtos.
create policy "Anonimo le fotos de produto ativo"
  on public.produto_fotos for select
  to anon
  using (exists (
    select 1 from public.produtos p
    where p.id = produto_fotos.produto_id and p.ativo = true
  ));

create policy "Autenticado le todas as fotos"
  on public.produto_fotos for select
  to authenticated
  using (true);

create policy "Somente autenticado insere foto"
  on public.produto_fotos for insert
  to authenticated
  with check (true);

create policy "Somente autenticado edita foto"
  on public.produto_fotos for update
  to authenticated
  using (true)
  with check (true);

create policy "Somente autenticado apaga foto"
  on public.produto_fotos for delete
  to authenticated
  using (true);

-- Gatilho do limite de 9. SECURITY INVOKER (padrão): conta com a visão de
-- quem está gravando, e só o autenticado grava (e ele vê todas as linhas).
create function public.produto_fotos_limite()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select count(*) from public.produto_fotos f
      where f.produto_id = new.produto_id and f.id <> new.id) >= 9 then
    raise exception 'Limite de 9 fotos extras por produto (10 com a capa).'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger produto_fotos_limite
  before insert or update of produto_id on public.produto_fotos
  for each row
  execute function public.produto_fotos_limite();

-- Função de gatilho não é para ser chamada por ninguém direto. O privilégio
-- de EXECUTE só é conferido ao criar o gatilho, não quando ele dispara.
revoke execute on function public.produto_fotos_limite() from public, anon, authenticated;

-- Grava a galeria inteira de um produto numa única transação: apaga as
-- fotos que saíram da lista, reposiciona as que ficaram e insere as novas,
-- na ordem recebida. p_fotos: [{"id": uuid} | {"caminho": text}, ...], na
-- ordem final. Devolve os caminhos das linhas apagadas (o servidor apaga
-- esses arquivos do storage depois).
--
-- SECURITY INVOKER: roda com o papel de quem chama, então a RLS de
-- produto_fotos vale aqui dentro. Executável só por authenticated.
create function public.salvar_produto_fotos(p_produto_id uuid, p_fotos jsonb)
returns text[]
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_removidos text[];
  v_ids integer;
  v_atualizados integer;
begin
  if p_fotos is null or jsonb_typeof(p_fotos) <> 'array' then
    raise exception 'Lista de fotos inválida.';
  end if;

  if jsonb_array_length(p_fotos) > 9 then
    raise exception 'Limite de 9 fotos extras por produto (10 com a capa).'
      using errcode = 'check_violation';
  end if;

  with apagadas as (
    delete from public.produto_fotos f
    where f.produto_id = p_produto_id
      and f.id not in (
        select (e->>'id')::uuid
        from jsonb_array_elements(p_fotos) e
        where e->>'id' is not null
      )
    returning f.caminho
  )
  select coalesce(array_agg(caminho), '{}') into v_removidos from apagadas;

  select count(*) into v_ids
  from jsonb_array_elements(p_fotos) e
  where e->>'id' is not null;

  update public.produto_fotos f
  set posicao = x.ord
  from jsonb_array_elements(p_fotos) with ordinality as x(e, ord)
  where x.e->>'id' is not null
    and f.id = (x.e->>'id')::uuid
    and f.produto_id = p_produto_id;
  get diagnostics v_atualizados = row_count;

  -- Id de outro produto, id inexistente ou id repetido na lista.
  if v_atualizados <> v_ids then
    raise exception 'Foto não pertence a este produto.';
  end if;

  insert into public.produto_fotos (produto_id, caminho, posicao)
  select p_produto_id, x.e->>'caminho', x.ord
  from jsonb_array_elements(p_fotos) with ordinality as x(e, ord)
  where x.e->>'id' is null;

  return v_removidos;
end;
$$;

revoke execute on function public.salvar_produto_fotos(uuid, jsonb) from public, anon;
grant execute on function public.salvar_produto_fotos(uuid, jsonb) to authenticated;
