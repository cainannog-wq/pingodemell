-- Segunda-feira fechada por padrão + observação interna editável.
--
-- Já aplicado em produção via MCP do Supabase (mesmo projeto de sempre).
-- Este arquivo fica no repositório só como registro do schema, seguindo o
-- padrão dos outros .sql desta pasta (dias-off-schema.sql, produtos-campos-cms.sql).
--
-- Modelo de dados: segunda-feira NÃO vira uma entrada na tabela dias_off
-- (isso seria uma "segunda genérica" fora do modelo de datas específicas
-- que a tabela já usa). Em vez disso, segunda-feira é tratada como fechada
-- por padrão na lógica do app, e uma tabela nova (segunda_reaberturas)
-- guarda as exceções pontuais — datas específicas de segunda-feira em que a
-- produção volta a funcionar. dias_off continua servindo só pra QUALQUER
-- outro dia da semana virar exceção fechada; segunda-feira usa o mecanismo
-- inverso.
--
-- Os 3 registros de segunda-feira semeados na entrega anterior de dias_off
-- (12/10, 02/11, 16/11 de 2026) ficaram redundantes com essa mudança de
-- modelo — removidos; duas dessas datas são re-semeadas abaixo como
-- exemplo de reabertura de segunda.
delete from public.dias_off where extract(dow from data) = 1;

alter table public.dias_off
  add column observacao text,
  add constraint dias_off_nao_pode_ser_segunda check (extract(dow from data) <> 1);

comment on column public.dias_off.observacao is 'Observação interna do admin (ex.: motivo do dia off). Uso só do CMS, sem exposição no catálogo público.';
comment on constraint dias_off_nao_pode_ser_segunda on public.dias_off is 'Segunda-feira é fechada por padrão (ver tabela segunda_reaberturas) e não deve ser duplicada aqui.';

-- Observação é editável inline na listagem do admin — precisa de UPDATE
-- autenticado, que a tabela não tinha até agora (só insert/select/delete).
create policy "Autenticado pode atualizar dia off"
on public.dias_off for update
to authenticated
using (true)
with check (true);

create table public.segunda_reaberturas (
  id uuid primary key default gen_random_uuid(),
  data date not null unique check (extract(dow from data) = 1),
  observacao text,
  criado_em timestamptz not null default now()
);

comment on table public.segunda_reaberturas is
  'Exceções pontuais em que a produção reabre numa segunda-feira específica (segunda é fechada por padrão). Leitura pública, escrita restrita a usuário autenticado do CMS.';
comment on column public.segunda_reaberturas.observacao is 'Observação interna do admin. Uso só do CMS, sem exposição no catálogo público.';

alter table public.segunda_reaberturas enable row level security;

create policy "Qualquer um pode ler reaberturas de segunda"
on public.segunda_reaberturas for select
to public
using (true);

create policy "Autenticado pode criar reabertura de segunda"
on public.segunda_reaberturas for insert
to authenticated
with check (true);

create policy "Autenticado pode atualizar reabertura de segunda"
on public.segunda_reaberturas for update
to authenticated
using (true)
with check (true);

create policy "Autenticado pode excluir reabertura de segunda"
on public.segunda_reaberturas for delete
to authenticated
using (true);

-- Dados de teste: mantém as duas datas não-segunda já semeadas (com
-- observação de exemplo) e re-semeia duas das segundas removidas acima como
-- reaberturas, pra dar pra ver os dois mecanismos funcionando no preview
-- sem precisar cadastrar nada manualmente.
update public.dias_off set observacao = 'Confraternização de fim de ano da equipe' where data = '2026-12-25';

insert into public.segunda_reaberturas (data, observacao) values
  ('2026-10-12', 'Encomenda grande confirmada — produção liberada excepcionalmente'),
  ('2026-11-16', 'Evento especial da cliente, precisa de segunda de produção')
on conflict (data) do nothing;
