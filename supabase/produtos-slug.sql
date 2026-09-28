-- URL amigável do produto (slug), etapa 1 de 2: coluna opcional, regra,
-- gatilhos de cadastro e de edição, preenchimento dos existentes e índice
-- único.
--
-- ADITIVA (coluna nova opcional, funções e gatilhos novos, restrições que
-- só olham a coluna nova). O gatilho só grava na coluna nova e nunca recusa
-- um cadastro do admin (nem o de produção, que não envia slug). Aplicação
-- antes de o lote chegar à main: exceção consciente autorizada pelo Cainan
-- em 28/09/2026 (PR slug), depois das provas em transação desfeita.
-- Status: ver docs/status-pingo-de-mell.md (tabela de migrações).
--
-- Etapa 2 (NOT NULL e gatilho de edição sem o ramo "vazio -> preenchido"):
-- supabase/produtos-slug-obrigatorio.sql, só depois do lote na main.
-- Desfazer: supabase/produtos-slug-desfazer.sql.
--
-- Sem begin/commit: quem aplica (a transação desfeita dos testes, ou o
-- apply_migration do MCP) já abre a transação. Prova antes de aplicar:
--   node scripts/banco/rodar-todos.mjs --com-migracao=supabase/produtos-slug.sql
--
-- Regra (fechada no escopo): o slug nasce do nome no cadastro e nunca muda,
-- nem se o produto for renomeado. Numa colisão com qualquer produto (ativo
-- ou inativo), ganha -2, -3... O código do site, o admin e os scripts de
-- carga NUNCA enviam slug; um slug enviado só é aceito se passar no formato
-- e não se repetir (único uso legítimo: restaurar backup com as URLs
-- originais).

set local lock_timeout = '2s';

-- ---------------------------------------------------------------------
-- Coluna nova, opcional até a etapa 2.
alter table public.produtos add column slug text;

comment on column public.produtos.slug is 'Endereço amigável do produto (/produtos/{slug}). Gerado pelo banco a partir do nome no cadastro (gatilho produtos_slug_no_cadastro) e fixo depois (gatilho produtos_slug_imutavel). Código e scripts nunca enviam slug; o único uso legítimo de slug enviado é restaurar backup.';

alter table public.produtos add constraint produtos_slug_formato
  check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

-- ---------------------------------------------------------------------
-- A regra, pura (não lê tabela): minúsculas; acentos, ç e ñ por uma tabela
-- fixa (sem a extensão unaccent); qualquer sequência fora de a-z e 0-9 vira
-- um único hífen; sem hífen no começo nem no fim; no máximo 80 caracteres
-- antes do sufixo de colisão; nome sem nenhum caractere válido vira
-- "produto".
create function public.produto_slug_base(p_nome text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(trim(both '-' from left(
      trim(both '-' from regexp_replace(
        translate(lower(coalesce(p_nome, '')),
          'áàâãäéèêëíìîïóòôõöúùûüçñ',
          'aaaaaeeeeiiiiooooouuuucn'),
        '[^a-z0-9]+', '-', 'g')),
      80)), ''),
    'produto');
$$;

-- Base livre, ou base-2, base-3... contra TODOS os produtos. Chamada pelo
-- gatilho de cadastro (que roda como o dono da tabela, então enxerga ativos
-- e inativos, qualquer que seja quem salva) e pelo preenchimento abaixo.
create function public.produto_slug_livre(p_nome text)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_base text := public.produto_slug_base(p_nome);
  v_slug text := v_base;
  v_n int := 1;
begin
  -- Dois cadastros com a mesma base ao mesmo tempo esperam um pelo outro,
  -- em vez de calcularem o mesmo sufixo.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('produtos.slug:' || v_base));
  while exists (select 1 from public.produtos where slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;
  return v_slug;
end;
$$;

-- ---------------------------------------------------------------------
-- Gatilho de cadastro: preenche o slug quando ele chega vazio.
-- SECURITY DEFINER: roda como o dono da tabela (postgres, que ignora a
-- RLS), então (1) a busca de colisão enxerga todos os produtos, qualquer
-- que seja o papel de quem salva, e (2) chama produto_slug_livre sem que o
-- admin logado precise de permissão de execução nela. Ninguém da API
-- executa esta função diretamente (revoke abaixo); o Postgres não confere
-- essa permissão ao disparar um gatilho.
create function public.produtos_slug_no_cadastro()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.slug is null or new.slug = '' then
    new.slug := public.produto_slug_livre(new.nome);
  end if;
  return new;
end;
$$;

create trigger produtos_slug_no_cadastro
  before insert on public.produtos
  for each row
  execute function public.produtos_slug_no_cadastro();

-- Gatilho de edição: slug preenchido nunca muda. Renomear o produto
-- continua permitido e não mexe no slug.
--
-- Ramo "vazio -> preenchido" (só usado pelo preenchimento abaixo; sai na
-- etapa 2): quando a única mudança é o slug, devolve o atualizado_em
-- antigo, para o preenchimento não contar como edição (a ordem de "Os mais
-- pedidos" depende dele). Isso depende de este gatilho rodar DEPOIS de
-- produtos_set_atualizado_em: o Postgres roda gatilhos do mesmo tipo em
-- ordem alfabética de nome ("produtos_se..." < "produtos_sl..."). A ordem é
-- conferida por scripts/banco/slug.mjs.
create function public.produtos_slug_imutavel()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.slug is not distinct from old.slug then
    return new;
  end if;
  if old.slug is not null then
    raise exception 'O endereço (slug) do produto "%" é fixo e não pode mudar: continua "%".', old.nome, old.slug
      using errcode = 'check_violation';
  end if;
  if (to_jsonb(new) - 'slug' - 'atualizado_em') = (to_jsonb(old) - 'slug' - 'atualizado_em') then
    new.atualizado_em := old.atualizado_em;
  end if;
  return new;
end;
$$;

create trigger produtos_slug_imutavel
  before update on public.produtos
  for each row
  execute function public.produtos_slug_imutavel();

-- Nenhum papel da API executa estas funções (regra do CLAUDE.md).
revoke execute on function public.produto_slug_base(text) from public, anon, authenticated;
revoke execute on function public.produto_slug_livre(text) from public, anon, authenticated;
revoke execute on function public.produtos_slug_no_cadastro() from public, anon, authenticated;
revoke execute on function public.produtos_slug_imutavel() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Preenchimento dos produtos existentes, do mais antigo para o mais novo
-- (em caso de colisão, o mais antigo fica com o slug sem sufixo). Só grava
-- na coluna nova; o atualizado_em de cada um fica como está (ver o gatilho
-- de edição acima).
do $$
declare
  r record;
begin
  for r in
    select id, nome from public.produtos where slug is null order by atualizado_em, nome
  loop
    update public.produtos set slug = public.produto_slug_livre(r.nome) where id = r.id;
  end loop;
end;
$$;

-- Slug único, valendo também para produto inativo.
alter table public.produtos add constraint produtos_slug_key unique (slug);
