# Estado técnico — Pingo de Mell

O status do projeto fica fora do repositório; este arquivo registra apenas o estado técnico.

Todo PR que traz migração de schema atualiza este arquivo no mesmo PR (ver CLAUDE.md). Última atualização: 28/09/2026 (PR #20, item 2d: unidade de venda, categoria Kits e categoria obrigatória no formulário; concluído na `lote` em 28/09/2026, squash; as duas migrações aplicadas antes do merge).

Banco único: o projeto Supabase `npervqefspmwmrekskcb` (região `sa-east-1`) atende produção, previews da Netlify e os scripts locais (`SUPABASE_URL` do `.env.local`). Não existe banco de staging.

## Migrações aplicadas em produção

Categoria pela regra do CLAUDE.md: **aditiva** (tabela nova, ou coluna nova opcional/com default) ou **não-aditiva** (muda tipo, apaga/renomeia, NOT NULL sem default em tabela com linhas, muda RLS de tabela em uso).

As anteriores a 22/09/2026 foram aplicadas pelo editor SQL do Supabase, sem registro na lista de migrações; a data é a do commit do arquivo (aproximada).

| Arquivo em `supabase/` | Registro no Supabase | Data (UTC) | Categoria |
|---|---|---|---|
| `heartbeat.sql` | — (editor SQL) | ~07/09/2026 | aditiva |
| `storage-policies.sql` | — (editor SQL) | ~11/09/2026 | políticas novas em `storage.objects` (bucket novo) |
| `pedidos-schema.sql` | — (editor SQL) | ~11/09/2026 | aditiva (tabelas novas `pedidos`, `pedidos_rate_limit`) |
| `pedidos-hardening.sql` | — (editor SQL) | ~14/09/2026 | não-aditiva (RLS/gatilhos de `pedidos`; anterior à regra de 22/09) |
| `produtos-campos-cms.sql` | `20260922135057 add_bebidas_categoria_produto`, `20260922135108 add_campos_cms_produto`, `20260922142238 permite_prazo_producao_zero_dias` | 22/09/2026 13:50–14:22 | aditiva (valor novo de enum e colunas com default); a última troca uma restrição de `prazo_producao_dias` (não-aditiva, anterior à regra) |
| `dias-off-schema.sql` | `20260922163832 cria_dias_off` | 22/09/2026 16:38 | aditiva |
| `dias-off-segunda-e-observacao.sql` | `20260922171248 dias_off_segunda_default_e_observacao` | 22/09/2026 17:12 | aditiva |
| `produto-cento-itens.sql` | `20260922184411 produto_cento_itens` | 22/09/2026 18:44 | aditiva |
| `produtos-id-atualizado-em.sql` | `20260923142918 produtos_id_atualizado_em` | 23/09/2026 14:29 | aditiva (aplicada antes do merge) |
| `produtos-rls-leitura-ativo.sql` | `20260924135256 produtos_rls_leitura_ativo` | 24/09/2026 13:52 | **não-aditiva** (aplicada depois do merge do PR #10) |
| `produto-fotos.sql` | `20260924152541 produto_fotos` | 24/09/2026 15:25:41 | aditiva (aplicada antes do merge do PR `galeria-admin`) |
| `seguranca-api.sql` | `20260924235504 seguranca_api` | 24/09/2026 23:55:04 | **não-aditiva** (retira permissões e uma política de objetos em uso); aplicada depois do merge do PR #12, uma vez, com lock_timeout de 2s; SQL registrado idêntico ao do merge (sha256 `2b428e8b…0292`) |
| `produtos-slug.sql` (slug, etapa 1) | `20260928050411 produtos_slug` | 28/09/2026 05:04:11 | aditiva (coluna opcional, 4 funções, 2 gatilhos, 2 restrições da coluna nova, preenchimento dos 15 existentes); aplicada **antes** do merge do PR `slug` na `lote`, exceção autorizada pelo Cainan, depois das provas em transação desfeita; uma vez, com lock_timeout de 2s; SQL registrado idêntico ao testado (sha256 `6574ae55…effacf`); `atualizado_em` dos 15 idêntico antes e depois |
| `produtos-slug-obrigatorio.sql` (slug, etapa 2) | — (**não aplicada**) | — | **não-aditiva** (NOT NULL em tabela com linhas); só depois de o lote chegar à `main`, quando o Cainan pedir (ver "Quando o lote for para a main") |
| `produtos-unidade-venda.sql` (PR #20, 2d) | `20260928134401 produtos_unidade_venda` | 28/09/2026 13:44:01 | aditiva (coluna `unidade_venda` texto, opcional, sem default, restrição `produtos_unidade_venda_formato` só nela); aplicada **antes** do merge do PR #20 (2d) na `lote`, depois da prova em transação desfeita; sha256 `e467a09c…931f`; `atualizado_em` dos 15 idêntico antes e depois |
| `categoria-kits.sql` (PR #20, 2d) | `20260928134708 categoria_kits` | 28/09/2026 13:47:08 | valor novo `Kits` no enum `categoria_produto` (muda o tipo em uso, sem tocar em nenhuma linha); **exceção consciente** à regra, aplicada antes do merge do PR #20 (2d) na `lote`, só depois do ok escrito do Cainan; **sem desfazer limpo** (o Postgres não remove valor de enum); contagem por categoria e `atualizado_em` iguais antes e depois |

## Rotas

Site público (`src/app/(site)`):

| Rota | Observação |
|---|---|
| `/` | Home |
| `/produtos` | Lista; filtro `?categoria=bolos\|doces\|salgados\|bebidas\|kits` |
| `/politica-de-privacidade` | |
| `/produtos/{slug}`, `/carrinho`, `/quem-somos`, `/quem-somos#contato` | reservadas em `src/lib/site/rotas.ts`; ainda caem na 404. Desde o PR `slug`, Home e Lista linkam a interna por `/produtos/{slug}` (antes, `/produtos/{id}`; o redirecionamento do endereço antigo fica fora) |

Admin (exige login; `src/app/admin`): `/login`, `/admin`, `/admin/produtos`, `/admin/produtos/novo`, `/admin/produtos/{nome}`, `/admin/pedidos`, `/admin/pedidos/{numero}`, `/admin/dias-off`.

API: `POST /api/pedidos` — **único caminho de gravação de pedido** (a cliente pede sem login): valida, confere o limite por IP (`registrar_tentativa_pedido`) e grava, tudo com a chave de serviço. Ainda nenhuma tela chama esta rota (o checkout não existe).

## Permissões e RLS

RLS ativa em todas as tabelas de `public` (e toda tabela nova nasce com RLS, pelo gatilho de evento `ensure_rls` → `rls_auto_enable`).

Em vigor desde 24/09/2026 23:55 UTC (`seguranca-api.sql`); a coluna "antes" fica como registro.

### Permissões por papel (antes da RLS)

S = ler, I = inserir, U = alterar, D = apagar, T = truncate (ignora a RLS).

| Tabela | anon antes | anon agora | authenticated antes | authenticated agora |
|---|---|---|---|---|
| `produtos` | S I U D T | S | S I U D T | S I U D |
| `produto_fotos` | S | S | S I U D | S I U D |
| `produto_cento_itens`, `dias_off`, `segunda_reaberturas` | S I U D T | S | S I U D T | S I U D |
| `pedidos` | S U D T + I em 13 colunas | nada | S U D T + I em 13 colunas | S U D |
| `pedidos_rate_limit`, `heartbeat` | S I U D T | nada | S I U D T | nada |
| contador `pedidos_numero_seq` | usa | não usa | usa | não usa |

A chave de serviço (`service_role`) ignora a RLS e não muda.

### Políticas de RLS

| Tabela | Leitura | Escrita |
|---|---|---|
| `produtos` | anon: só `ativo = true`; authenticated: todos | insert/update/delete: authenticated |
| `produto_cento_itens` | pública (todos) | insert/update/delete: authenticated |
| `produto_fotos` | anon: só fotos de produto com `ativo = true` (condição na própria política); authenticated: todas | insert/update/delete: authenticated |
| `pedidos` | authenticated | **sem política de insert — só o servidor grava** (chave de serviço; a política de insert público foi removida em 24/09/2026). update/delete: authenticated |
| `pedidos_rate_limit` | nenhuma política (só service role) | nenhuma política (só service role) |
| `heartbeat` | nenhuma política (só service role) | nenhuma política (só service role) |
| `dias_off`, `segunda_reaberturas` | pública | insert/update/delete: authenticated |
| `storage.objects` (bucket público `Pingo de Mell`) | **sem política de SELECT**: arquivos abertos pela URL pública do bucket; a sessão logada não lista nem enxerga objetos | insert/update/delete: authenticated, `bucket_id = 'Pingo de Mell'` (na prática o delete com a sessão logada não apaga nada, porque sem SELECT a linha não é visível) |

Arquivos no bucket (`src/lib/galeria/storage-servidor.ts`; listar/apagar sempre pelo servidor com a service role, depois de conferir o login):

- **Capa** (`produtos.image_url`, endereço público completo). Desde o PR `capa-admin`: `capa/{produto_id}/{uuid}.webp|jpg`, reduzida no navegador (até 2000px, sem metadados) e enviada direto ao storage com token assinado por caminho, só no Salvar (sem o limite de 1 MB da Server Action); o servidor confere existência, até 2 MB e tipo real antes de gravar. As capas anteriores continuam na raiz (`{timestamp}-{aleatório}.{ext}`) e funcionam sem migração. Na troca, a antiga (raiz ou `capa/{id}/`) é apagada só depois de a nova estar gravada, e só se nenhuma outra linha (produto ou foto extra) usar o arquivo; o caminho sai do `image_url` gravado, nunca do navegador. No fim de todo Salvar que mexe na capa, o servidor apaga de `capa/{id}/` o que não for a capa gravada. Excluir o produto apaga a capa, `capa/{id}/` e `galeria/{id}/`.
- **Fotos extras**: `galeria/{produto_id}/{uuid}.webp|jpg` (mesmo envio e conferência; só dentro dessa pasta).

O bucket não tem limite de tamanho nem de tipo de arquivo; o limite fica no código.

Sobras sem limpeza automática (só vão para o log do servidor): capa antiga da **raiz** que falhou ao ser apagada depois da troca, e arquivos de um produto excluído quando a exclusão do arquivo falha depois de o produto já ter saído do banco. Quem acha: `node scripts/arquivos-sem-dono.mjs` (só leitura), que **roda antes da limpeza dos produtos fictícios e antes da carga real**.

**Admin de produção até o lote chegar à `main`: ninguém troca capa por ele.** A produção ainda roda o código antigo, que grava a capa na raiz pela Server Action (limite de 1 MB, foto de celular recusada) e deixa sobrando a capa de `capa/{id}/`. Editar outros campos pelo admin de produção não mexe na capa e não quebra nada. Trocar capa só pela homologação até o merge do lote.

Limite aceito: a RLS de `produto_fotos` esconde a lista de fotos de produto inativo, não os arquivos; quem tem a URL do arquivo continua abrindo (como a capa).

## Slug do produto (URL amigável)

Desde o PR `slug` (28/09/2026). Migração: `supabase/produtos-slug.sql` (etapa 1, aplicada), `supabase/produtos-slug-obrigatorio.sql` (etapa 2, pendente), `supabase/produtos-slug-desfazer.sql` (desfaz a etapa 1; só com ok do Cainan, ou sozinho se o admin ou o site de produção quebrarem por causa dela).

- **O slug é gerado e travado no banco.** O gatilho `produtos_slug_no_cadastro` gera o slug a partir do nome quando o cadastro chega sem slug; o gatilho `produtos_slug_imutavel` recusa qualquer mudança num slug preenchido (erro `23514`, mensagem "O endereço (slug) do produto ... é fixo"). Renomear continua permitido e não mexe no slug. Vale para o admin novo, o admin antigo de produção e qualquer script, sem código nenhum.
- **Código e scripts nunca enviam slug**: gravam sem ele e leem o valor depois (provado por `capa-actions.test.ts` e `scripts/banco/slug.mjs`). O banco aceita um slug enviado no cadastro se ele estiver no formato e não se repetir; **o único uso legítimo é restaurar backup** (regravar os slugs originais para as URLs não mudarem).
- **Regra**: minúsculas; `á à â ã ä é è ê ë í ì î ï ó ò ô õ ö ú ù û ü ç ñ` pela tabela fixa (sem a extensão `unaccent`); qualquer sequência fora de `a-z0-9` vira um hífen; sem hífen no começo nem no fim; até 80 caracteres antes do sufixo; nome sem caractere válido vira `produto`. Colisão com qualquer produto, ativo ou inativo: `-2`, `-3`... Formato garantido pela restrição `produtos_slug_formato`; único pela `produtos_slug_key`.
- **Consequências aceitas:**
  - produto recadastrado com o mesmo nome de um produto **desativado** ganha sufixo (`-2`) na URL, para sempre;
  - se o produto antigo for **excluído**, o slug fica livre e o endereço antigo passa a abrir o produto novo. Por isso a documentação de uso do admin (Fase 5) reforça: **desativar, nunca excluir**.
- **Leitura pelo slug fica no código do site**: `buscarProdutoPorSlug` (`src/lib/vitrine/buscar.ts`), só produto ativo, com o filtro de ativo na própria consulta (o admin logado navegando no site lê também os inativos). **Não existe e não deve ser criada função de banco pública para isso**; a interna usa essa função.
- **Ordem dos gatilhos de edição** (etapa 1): `produtos_slug_imutavel` precisa rodar depois de `produtos_set_atualizado_em` (o Postgres roda em ordem alfabética de nome) para o preenchimento de slug vazio não mexer no `atualizado_em`. `scripts/banco/slug.mjs` (slug 13) falha se a ordem mudar. A etapa 2 tira esse ramo, e a dependência some. **Esse teste só roda na bateria de banco, fora do `npm run test`**: por isso todo PR que mexe em gatilho ou função de `produtos` roda `node scripts/banco/rodar-todos.mjs` antes do merge (com `--com-migracao=<arquivo.sql>` se ainda não aplicado) e mostra a saída no PR (regra no CLAUDE.md); sem isso, a proteção não vale.
- **Requisito do script da carga dos 60 produtos (ainda não existe)**: faz o insert sem slug, lê o slug gravado (`.insert(p).select("id, slug")`), mostra o slug de cada produto e avisa quando algum ganhar sufixo.
- Fora do PR `slug`: redirecionamento de `/produtos/{id}`, campo de slug no admin, endereço da tela de edição do admin (continua pelo nome).

Os 15 produtos em 28/09/2026 05:04 UTC, depois da etapa 1 (todos com `atualizado_em` idêntico ao de antes): `beijinho`, `bolo-de-chocolate-com-ninho`, `brigadeiro-gourmet`, `brigadeiro-gourmet-unidade`, `cento-de-docinho`, `cento-de-salgados-sortidos`, `coca-cola-2l`, `coxinha-de-frango` (inativo), `coxinha-de-frango-cento`, `empada-de-palmito`, `kit-festa-sortido`, `morango-banhado`, `risole-de-carne`, `suco-de-laranja-natural-1l`, `torta-de-limao-fatia` (inativo).

## Unidade de venda e categoria Kits (PR #20, 2d)

- **`produtos.unidade_venda`**: texto livre, opcional, até 20 caracteres, sem espaço sobrando (restrição `produtos_unidade_venda_formato`; o formulário também junta espaços repetidos). Texto e não enum para a lista crescer com o catálogo sem mudar o banco. O admin sugere `kg`, `unidade`, `cento`, `litro`. Card: `R$ X o kg`, `a unidade`, `o litro`, `o cento`; outro texto vira `por {texto}`; vazio mostra só o preço (como antes); produto tipo cento é sempre `o cento` (`textoUnidadeVenda`, `src/lib/vitrine/mais-pedidos.ts`).
- **Quilo inteiro**: não há trava própria. Vale porque `pedido_minimo` é inteiro (banco e formulário recusam `1,5`) e o step é livre/5/10; com unidade `kg`, 1 = 1 kg. **Requisito do carrinho futuro:** quantidade sempre inteira na unidade de venda; se o carrinho aceitar fração, meio quilo de bolo passa a ser possível.
- **Kits**: quinto valor de `categoria_produto` (depois de Bebidas na ordem do enum; nenhuma consulta ordena por categoria). Filtro `?categoria=kits` na Lista, quinto quadrado na Home (sem foto, como Bebidas). Kits conta como "não bebida" em "Os mais pedidos".
- **Categoria obrigatória só no formulário** (admin do lote e servidor, em `parseProdutoForm`); a coluna continua aceitando nulo.
- **Risco até o lote chegar à `main`:** o admin de produção (código da `main`) só conhece 4 categorias. Um produto em Kits aberto e salvo ali volta para "Sem categoria" sem aviso (o campo mostra a primeira opção e grava vazio). Por isso **nenhum produto real vai para Kits antes disso**; o Kit Festa Sortido continua sem categoria. O site de produção lê um produto em Kits sem quebrar (aparece em "Todos"; `?categoria=kits` cai em "Todos").

## Quando o lote for para a main

Passos que dependem do merge da `lote` na `main`, na ordem dos PRs:

1. **Slug, etapa 2** (PR `slug`), só quando o Cainan pedir: conferir que nenhum produto está sem slug (`select count(*) from public.produtos where slug is null or slug = ''` → 0; a própria migração também cancela se achar algum), rodar `node scripts/banco/slug-migracao.mjs` (prova a etapa 2 em transação desfeita), aplicar `supabase/produtos-slug-obrigatorio.sql` (NOT NULL e `produtos_slug_imutavel` recriado sem o ramo "vazio -> preenchido"), rodar `node scripts/banco/rodar-todos.mjs` e o verificador de segurança, e atualizar a tabela de migrações.
2. **Mover o Kit Festa Sortido para Kits** (PR #20, 2d), pelo Salvar normal do admin, com o Cainan acompanhando, só com o admin novo já em produção (antes disso o admin de produção apagaria a categoria sem aviso). Muda o `atualizado_em` dele (efeito aceito); conferir que nenhum outro produto mudou.
3. **Categoria obrigatória no banco** (PR #20, 2d), junto da etapa 2 do slug: migração **não-aditiva** ainda não escrita (`alter table public.produtos alter column "Categoria" set not null`), só depois do passo 2 e de conferir `select count(*) from public.produtos where "Categoria" is null` → 0. Provar antes em transação desfeita (`rodar-todos.mjs --com-migracao=...`).

## Funções e gatilhos em `public`

| Função | Segurança | Executável por (antes → agora, desde `seguranca-api.sql`) | Uso |
|---|---|---|---|
| `salvar_produto_fotos(uuid, jsonb)` | INVOKER | authenticated (não anon) | grava a galeria de um produto numa transação |
| `registrar_tentativa_pedido(...)` | DEFINER | anon e authenticated → **só service_role** | limite por IP de `POST /api/pedidos` |
| `produto_fotos_limite()` | INVOKER | ninguém direto (gatilho) | gatilho `produto_fotos_limite` (máx. 9 fotos extras) |
| `produtos_set_atualizado_em()` | INVOKER | anon e authenticated → ninguém direto (gatilho) | gatilho `produtos_set_atualizado_em` (todo update em `produtos`) |
| `pedidos_recalcular_totais()` | INVOKER | anon e authenticated → ninguém direto (gatilho) | gatilho `trg_pedidos_recalcular_totais` |
| `pedidos_set_status_atualizado_em()` | INVOKER; `search_path` fixo (vazio) | anon e authenticated → ninguém direto (gatilho) | gatilho `trg_pedidos_status_atualizado_em` |
| `rls_auto_enable()` | DEFINER | anon e authenticated → ninguém direto (gatilho de evento) | liga RLS em tabela nova |
| `produto_slug_base(text)` | INVOKER, imutável | ninguém da API (nasceu assim, 28/09) | a regra do slug, pura |
| `produto_slug_livre(text)` | INVOKER | ninguém da API | base livre ou `-2`, `-3`... contra todos os produtos (usada pelo gatilho de cadastro e pelo preenchimento) |
| `produtos_slug_no_cadastro()` | **DEFINER** (dono `postgres`, que ignora a RLS: a busca de colisão enxerga todos os produtos, qualquer que seja o papel de quem salva) | ninguém direto (gatilho) | gatilho `produtos_slug_no_cadastro` (antes de insert em `produtos`) |
| `produtos_slug_imutavel()` | INVOKER | ninguém direto (gatilho) | gatilho `produtos_slug_imutavel` (antes de update em `produtos`, depois de `produtos_set_atualizado_em`) |

Padrão para objeto novo: desde `seguranca-api.sql`, toda função nova criada pelo papel `postgres` nasce sem EXECUTE para PUBLIC, anon e authenticated (antes nascia executável por eles) (funções criadas pelo painel da Supabase, papel `supabase_admin`, continuam com o padrão antigo). Tabela nova continua nascendo com todas as permissões para anon e authenticated, protegida só pela RLS — a migração que cria a tabela tira o que não é preciso (ver CLAUDE.md).

## Verificador de segurança do Supabase (security advisors)

Agora (28/09/2026 13:47 UTC, verificador real, depois de `categoria-kits.sql`; igual ao de antes e depois de `produtos-unidade-venda.sql`, ao de `produtos-slug.sql` e ao de 24/09): INFO RLS sem política em `heartbeat` e `pedidos_rate_limit` (intencional: só a chave de serviço, e anon/authenticated nem têm permissão nelas); WARN proteção de senha vazada desligada (configuração do Auth, fora da migração).

Antes da migração havia também: WARN `registrar_tentativa_pedido` e `rls_auto_enable` executáveis como DEFINER por anon e por authenticated; WARN `search_path` não fixo em `pedidos_set_status_atualizado_em`.

## Auth

- Cadastro público desligado, CAPTCHA (Turnstile) ligado, login anônimo desligado, só provedor e-mail (conferido em 24/09/2026).
- **Proteção de senha vazada (HaveIBeenPwned): desligada.** Liga no painel, Auth > Password security; pode depender do plano pago. Registrado, fora do PR `seguranca-api`.
- **2 usuários no Auth:** o admin real e o usuário de teste criado por `scripts/create-test-admin.mjs` (`TEST_ADMIN_EMAIL`). **O de teste deve ser removido antes da entrega.** Os testes novos não usam mais esse usuário (simulam o papel logado dentro da transação).

## Onde vive cada chave

Na próxima troca de qualquer chave, atualizar **todos** os lugares da linha. Nunca mostrar o valor (nada de `cat`/`type` no `.env.local`).

| Chave | `.env.local` | Variáveis da Netlify | Segredo do GitHub | Outros |
|---|---|---|---|---|
| `SUPABASE_URL` | sim | sim | — (fixa no workflow do heartbeat) | não é segredo |
| `SUPABASE_ANON_KEY` | sim | sim | — | pública por design (vai no código do site) |
| `SUPABASE_SERVICE_ROLE_KEY` | sim | sim | sim (`.github/workflows/supabase-heartbeat.yml`) | — |
| `SUPABASE_DB_URL` (senha do banco) | sim (testes de `scripts/banco/`) | não | não | nenhum código do site usa a senha do banco |
| `TURNSTILE_SITE_KEY` | sim | sim | — | pública por design; widget na Cloudflare |
| `TURNSTILE_SECRET_KEY` | sim (`scripts/test-turnstile-verify.mjs`) | a conferir no painel (o código do site não lê) | — | painel da Supabase, Auth > CAPTCHA (é quem valida o login); Cloudflare |
| `TEST_ADMIN_EMAIL`, `TEST_ADMIN_PASSWORD` | sim | não | não | usuário de teste no Auth (remover antes da entrega) |

Lição de 11–24/09/2026: a chave de serviço foi trocada em 11/09 e o segredo do GitHub ficou com a antiga; o heartbeat falhou de 13/09 a 22/09 (401 "Unregistered API key") até o segredo ser atualizado em 24/09.

A coluna "Variáveis da Netlify" foi montada pelo que o código lê em produção (`next.config.ts`, `src/lib/supabase/`); o painel da Netlify não foi aberto para não expor valores.

## Scripts de teste

Regra (CLAUDE.md): **nenhum script de teste grava em produção**. O banco é um só.

Testes de banco: `scripts/banco/`, cada um numa transação desfeita no fim, conectando direto no Postgres (`SUPABASE_DB_URL`, Session pooler). Simulam o papel da API (anon, authenticated, service_role) como o PostgREST faz, então valem para o que está de fato em produção. `--com-migracao=<arquivo.sql>[,<outro.sql>]` roda esses arquivos, na ordem, dentro da mesma transação desfeita, antes das verificações (prova de migração antes de aplicar; ex.: `--com-migracao=supabase/produtos-slug.sql`).

| Script | Prova | Banco | Grava? |
|---|---|---|---|
| `node scripts/banco/rodar-todos.mjs [--com-migracao=<arquivo.sql>]` | roda todos abaixo e compara o banco antes e depois (linhas e conteúdo de cada tabela de `public`, contagens de storage e auth, contadores) | produção, só leitura para a comparação | não (falha se algo mudar) |
| `scripts/banco/permissoes.mjs` | permissões de cada papel em cada tabela e função, contador de pedido, padrão de função nova, RLS em tabela nova, storage sem política para anon, alertas de banco do verificador | produção, transação desfeita | não |
| `scripts/banco/produtos.mjs` | RLS de `produtos` e `produto_fotos`; admin lê/insere/altera/apaga; gatilhos `produtos_set_atualizado_em` e `produto_fotos_limite`; `salvar_produto_fotos` | produção, transação desfeita | não |
| `scripts/banco/produto-cento-itens.mjs` | RLS de `produto_cento_itens` | produção, transação desfeita | não |
| `scripts/banco/dias-off.mjs` | RLS de `dias_off` e `segunda_reaberturas` | produção, transação desfeita | não |
| `scripts/banco/pedidos.mjs` | ninguém da API grava direto; servidor grava (cópia da tabela, contador próprio); status inicial; totais recalculados; número não forjável; anon não lê/altera/apaga; admin lê/altera/apaga; gatilho de status | produção, transação desfeita | não (não usa o contador real) |
| `scripts/banco/limite-pedidos.mjs` | anon/logado não chamam `registrar_tentativa_pedido`; servidor: 6ª tentativa bloqueada, IPs independentes, janela recomeça | produção, transação desfeita | não |
| `scripts/banco/slug.mjs` | slug: regra com casos de borda, colisão `-2`/`-3` (inclusive contra inativo), admin e chave de serviço cadastram sem slug, editar/renomear mantém o slug, cascata do Cento, troca de slug recusada, slug enviado (restauração), funções fora do alcance de anon e logado, ordem dos gatilhos de edição, preenchimento sem mexer no `atualizado_em` | produção, transação desfeita | não |
| `scripts/banco/slug-migracao.mjs` | etapa 1 sobre os produtos existentes (se ainda não aplicada: slugs, `atualizado_em`, "Os mais pedidos", tabelas e estrutura iguais), etapa 2 (e o cancelamento dela com produto sem slug) e desfazer (banco igual ao de antes da etapa 1) | produção, transação desfeita | não |
| `scripts/banco/unidade-venda-kits.mjs` | coluna `unidade_venda` (texto, nulo, sem default), nenhum gatilho novo em `produtos`, logado grava kg/texto livre/nulo, banco recusa vazio/espaço sobrando/mais de 20, anônimo lê; enum com os 5 valores, logado cadastra em Kits e o anônimo acha pelo filtro (a parte de Kits é pulada com aviso se o valor ainda não existir) | produção, transação desfeita | não |
| `scripts/banco/http-sem-gravar.mjs` | camada HTTP com a chave anônima: chamadas que nunca gravam (função por GET, que roda só leitura; insert com valor inválido; update/delete de id inexistente) | produção, pela API | não |
| `npm run test` (vitest) | regras, telas, Server Actions e `POST /api/pedidos` (IP da Netlify, X-Forwarded-For ignorado em produção, 429, gravação só pela chave de serviço) com banco simulado. Roda duas vezes, nos fusos UTC e America/Sao_Paulo; testes com "hoje" fixam o relógio (`RELOGIO_TESTE=<instante>` fixa o da suíte inteira) | nenhum (não acessa rede) | não |
| `scripts/netlify/ignorar-build.mjs` | não é teste: regra de ignorar build da Netlify (roda antes de cada build). A regra é testada por `npm run test` (`scripts/netlify/ignorar-build.test.mjs`, com um repositório git temporário) | nenhum | não |
| `node scripts/arquivos-sem-dono.mjs` | todo arquivo do bucket sem linha no banco (raiz, `capa/`, `galeria/`), linha apontando para arquivo inexistente, arquivo usado por duas linhas e `capa/{id}/` com mais de um arquivo; sai com código 1 se achar algo. **Rodar antes da limpeza dos fictícios e antes da carga real** | produção, transação READ ONLY desfeita | não (só leitura) |
| `scripts/ver-fotos-anonimo.mjs <id>` | lista, como anônimo, as fotos extras de um produto na ordem | produção, pela API | não (só leitura) |
| `node scripts/ver-slugs.mjs` | busca cada produto pelo slug com a consulta de `buscarProdutoPorSlug`, como anônimo e com a chave de serviço (lê tudo, como o admin logado): ativo devolve, inativo e inexistente voltam vazios | produção, pela API | não (só leitura) |
| `node scripts/ver-vitrine.mjs [endereço]` | "Os mais pedidos" da Home e os cards da Lista, na ordem da tela, com o link de cada card (padrão: produção; serve para a homologação) | site, por GET | não (só leitura) |
| `scripts/test-turnstile-verify.mjs` | secret key do Turnstile ativa | Cloudflare | não |
| `scripts/check-service-key-bundle.mjs` | a service role key não aparece em `.next/static` (rodar depois do build) | nenhum (arquivos locais) | não |
| `scripts/test-auth-rate-limit.mjs` | limite de tentativas de login do Supabase Auth | Auth de produção | não grava dados; **manual**: tentativas de login seguidas podem bloquear o login do seu IP por alguns minutos |

Última rodada contra produção (28/09/2026 ~13:48 UTC, depois de `categoria-kits.sql`, sem `--com-migracao`): os 9 testes de banco 121/121, `http-sem-gravar.mjs` 17/17, banco idêntico antes e depois, contador de pedidos em 1047.

Conexão com o banco: TLS conferindo o certificado do servidor com `supabase/prod-ca.crt` (certificado público da Supabase, baixado no painel em Database > Settings > SSL Configuration). Provado em 24/09/2026: conecta com o certificado certo e é recusada com um certificado de outra autoridade (`SUPABASE_DB_CA=<arquivo>` troca o certificado para essa prova; se o arquivo não existir, o script para).

Scripts de carga — **gravam em produção por definição, não são teste**: `scripts/seed-produtos-demo.mjs`, `scripts/seed-produto-cento-demo.mjs`, `scripts/seed-pedidos-demo.mjs`, `scripts/create-test-admin.mjs`.

Removidos no PR `seguranca-api` (gravavam em produção ou criavam sessão real no Auth): `test-rls.mjs`, `test-rls-fotos.mjs`, `test-rls-pedidos.mjs`, `test-mass-assignment-pedidos.mjs`, `test-rls-dias-off.mjs`, `test-rls-produto-cento-itens.mjs`, `test-rate-limit-pedidos.mjs`, `test-rate-limit-netlify.mjs`. Continuam no histórico do git.

### Checagem manual rara: limite por IP na Netlify real

Toda chamada a `POST /api/pedidos` grava uma linha no contador de tentativas (`pedidos_rate_limit`) — não existe jeito de desfazer. Por isso a prova de ponta a ponta com o proxy real da Netlify (IP vindo de `x-nf-client-connection-ip`, `X-Forwarded-For` forjado ignorado) **não é script**: é uma checagem manual, só com o ok do Cainan em cada vez.

Como fazer, com o ok: 6 requisições seguidas a `https://<deploy>/api/pedidos`, cada uma com um `X-Forwarded-For` diferente e um corpo **inválido** (ex.: `itens: []`) — o limite é conferido antes da validação, então as 5 primeiras voltam 400 (nenhum pedido gravado) e a 6ª volta 429. Grava: 1 linha em `pedidos_rate_limit` (o IP de quem testou), que pode ser apagada depois, também com ok. A lógica da rota está coberta sem gravar em `src/app/api/pedidos/route.test.ts`, e a do banco em `scripts/banco/limite-pedidos.mjs`.

## Homologação (Netlify)

- Endereço fixo: `homologacao--pingodemell.netlify.app`, branch deploy da branch `homologacao`. Na Netlify (Project configuration > Developer settings > Branches and deploy contexts): production branch `main`; branch deploys só para `homologacao` (ligado em 24/09/2026); Deploy Previews para PRs contra a `main`.
- Turnstile: `homologacao--pingodemell.netlify.app` liberado de forma permanente (24/09/2026). Deploy Previews não estão liberados: o CAPTCHA recusa login neles (erro 110200).
- Banco: o mesmo de produção (as variáveis do contexto "Branch deploys" têm os mesmos valores de produção). Tudo que se grava lá é real.
- Fora do Google: `X-Robots-Tag: noindex, nofollow` em todas as rotas, só quando `CONTEXT === "branch-deploy"` (`next.config.ts`, teste em `next-config.test.ts`). A Netlify já põe `noindex` nos Deploy Previews e nos links fixos de deploy, mas não no endereço da branch. Produção sem o cabeçalho.
- Registro de tempo do Salvar do produto no console do navegador (`src/lib/admin/tempos.ts`): **só no build da homologação** (`MEDIR_TEMPOS_ADMIN="1"` quando `CONTEXT === "branch-deploy"`, em `next.config.ts`). Uma linha por Salvar (nome, id, total do clique até a listagem aparecer, preparar, enviar, gravar) e outra com a redução da foto ao escolher o arquivo; a listagem mostra o histórico da aba. No build de produção o código some do bundle (busca por `[tempo capa]` em `.next/static`: 0 arquivos; no build da homologação: 2).
- Commit servido: a homologação responde com `X-Homologacao-Commit: <commit>` (`COMMIT_REF` da Netlify no build; só com `CONTEXT === "branch-deploy"`, teste em `next-config.test.ts`). Conferência sem abrir o painel: `curl -sI https://homologacao--pingodemell.netlify.app/login` e comparar com `git rev-parse origin/homologacao`.
- Fluxo (regras no CLAUDE.md): a homologação está sempre com "o PR em validação" ou "igual à produção"; um PR por vez; o Cainan só valida depois de "homologação = commit X do PR Y", conferido na lista de deploys da Netlify.
  - Levar um PR: `git push --force-with-lease origin <branch-do-pr>:homologacao`
  - Voltar para a produção: `git push --force-with-lease origin origin/main:homologacao`
  - Enquanto valer o fluxo em lote: "igual à produção" vira "igual à `lote`" (`git push --force-with-lease origin origin/lote:homologacao`).
- Criada em 24/09/2026 igual à `main` (`a828567`), deploy `6ab5cf7f…`.
- **Cabeçalho atrasado desde 28/09/2026:** `homologacao` = `lote` = `dcca3e7` (squash do PR #20), mas o build foi pulado (diferença só em `docs/status-pingo-de-mell.md`) e o site servido é o build de `2de458e` (último commit do PR #20), com o mesmo código; `X-Homologacao-Commit` mostra `2de458e`. O próximo PR que mexer no site (`src/`) builda e corrige. Para não repetir: o último commit levado à homologação antes do merge deve já ter a árvore final (commit de status antes de levar o PR).
- PRs contra a `lote` provavelmente não ganham Deploy Preview (a Netlify gera preview para PRs contra a `main`); a validação é na homologação de qualquer jeito.

## Créditos da Netlify

Regras no CLAUDE.md ("Regra de custo — créditos da Netlify e merges em lote").

- Conta `cainannog-wq`, plano **Free: 300 créditos por ciclo**, sem cobrança extra: quando acabam, **os 6 sites da conta saem do ar** (pingodemell, restospsicanaliticos, dudatortatosite, reliable-pixie-4e7fd7, msclicksfotografia, dudatortato) até o ciclo virar. Todos dividem o mesmo saldo.
- Ciclo atual: **20/09 a 19/10/2026**. Saldo em 25/09/2026 ~11:15 (Brasília): **45,3 de 300**; em 27/09/2026, lido pelo Cainan no painel: **29**; em 28/09/2026, no início do PR `slug`, lido pelo Cainan no painel: **28**. O **28 do fechamento do PR `slug` (28/09/2026) foi uma dedução, não uma leitura do painel**: o PR não gerou deploy de produção (só branch deploys da homologação, que não custam), então o saldo foi dado como igual ao do início. A próxima leitura do painel confirma ou corrige. Em 28/09/2026, no início do PR #20 (2d), lido pelo Cainan no painel: **27,5**; no fim, também lido no painel: **27,2** (o PR não gerou deploy de produção; a diferença de 0,3 deve ser consumo de requisições, banda e compute, inclusive da homologação; não conferido item a item).
- **Deploy de produção acidental em 28/09/2026 11:28 (Brasília), 15 créditos:** depois do merge do PR #20 na `lote`, o build da homologação foi pulado (só `docs/` mudou) e o Claude sugeriu "Trigger deploy" no painel para forçar. Na página de Deploys esse botão publica a branch de produção: saiu "Production: main@8853c44", publicado. Sem prejuízo além dos créditos: entre `e191bdf` (deploy anterior) e `8853c44` só mudou `heartbeat-log.txt`, então o conteúdo publicado não mudou. **Não usar "Trigger deploy" nem "Clear cache and deploy site" da página de Deploys para a homologação.** Saldo do plano Free antes da troca de plano, lido pelo Cainan: **11,9**.
- **Plano Personal desde 28/09/2026:** **1.000 créditos**, concedidos em 28/09/2026, expiram em **27/10/2026** (ciclo novo até 27/10). Saldo em 28/09/2026, lido pelo Cainan: **1.000**. O piso continua: **abaixo de 15 créditos, nenhum push em nenhuma branch** até o Cainan decidir, mesmo com o plano pago.
- Custo (documentação da Netlify): deploy de produção publicado = 15 créditos; Deploy Preview, branch deploy, build pulado e build que falha = 0. Também custam: requisições web (2 por 10 mil), banda (20 por GB) e compute (10 por GB-hora), inclusive nos previews e na homologação.
- Gasto do ciclo até 25/09: 16 deploys de produção do pingodemell (240), banda 6,6, compute 4,9, requisições 3,3; total 254,7. Dos 16 deploys: 13 merges de PR (#1, #2, #3, #6 a #15) e 3 commits do heartbeat (1 agendado, 2 rodados à mão em 24/09). A regra de ignorar build teria pulado 5 deles: #7 (só `CLAUDE.md`), #8 (só `.gitignore`) e os 3 do heartbeat.
- Heartbeat: agendado a cada 3 dias (dias 1, 4, 7… do mês, 06:00 UTC). Sem a marcação, cada execução fazia um deploy de produção (15 créditos); até 19/10 seriam mais 7 (105), o suficiente para zerar o saldo por volta de 04/10. Desligado com `gh workflow disable` em 25/09/2026 ~11:20 (Brasília), antes da correção.
- Economia (PR economia-deploys): commit do heartbeat com `[skip netlify]`; regra de ignorar build em `netlify.toml` (`scripts/netlify/ignorar-build.mjs`, teste em `scripts/netlify/ignorar-build.test.mjs`). Continuam gerando deploy: `src/`, `public/`, `package.json`, `package-lock.json`, `next.config.ts`, `netlify.toml`, `tsconfig.json`, `eslint.config.mjs`, `vitest.config.ts`, `vitest.setup.ts`, arquivos de teste fora de `scripts/` (`*.test.ts(x)`) e `supabase/prod-ca.crt`. Sem commit anterior para comparar (primeiro build da branch, "Clear cache and deploy", "Trigger deploy" do mesmo commit) ou se o `git diff` falhar, a regra builda. **A base da comparação é o último commit construído, não o último tentado**: se a branch avança só com `docs/` depois do último build, os builds seguintes continuam sendo pulados até mudar algo do site (visto em 28/09/2026 na homologação, `2de458e` → `dcca3e7`).
- Provas na homologação (25/09/2026, antes do merge): commit vazio com `[skip netlify]` (`5446c15`) não criou deploy nenhum (a lista da Netlify não tem status "Skipped": o commit simplesmente não aparece); commit só em `docs/` (`2612f51`) virou deploy "Canceled" ("Canceled build due to no content change", log `ignorar-build: só arquivos fora do site mudaram`); commit em `src/` (`605f9f7`) buildou normalmente.
- Como a Netlify conta (observado em 25/09/2026): o saldo leva minutos para refletir um deploy; ler só uns 30 minutos depois. Às 11:13 (Brasília), um minuto depois do deploy de produção do #15, o painel mostrava 16 deploys de produção e 45,3 créditos; a partir de ~11:37, 17 deploys e 29,9, e assim ficou até ~11:50 (29,7), mesmo com 4 builds que não são de produção concluídos no meio (Deploy Preview #16 e 3 branch deploys da homologação) e 1 cancelado. Deploy Preview e branch deploy **não** são cobrados (seriam +60). A lista de deploys de produção do ciclo tem 16 (13 merges de PR e 3 heartbeats), e o contador marca 17: 1 deploy (15 créditos) cobrado sem correspondente na lista, sem explicação. Nenhum dos outros 5 sites publicou nada desde 24/09 23:00 UTC (lista de builds da equipe e último deploy publicado de cada um: restospsicanaliticos ~14/09, dudatortatosite ~20/08, reliable-pixie-4e7fd7 ~13/08, msclicksfotografia ~04/08, dudatortato ~julho).

## Registros

- **Número de pedido 1047 gasto em 24/09/2026**, numa transação desfeita que provou que o anônimo gravava direto em `pedidos` (o contador não volta com o rollback). O próximo pedido real será o 1048; não existe pedido 1047.
- **Limpeza feita em 25/09/2026 ~00:00 UTC, com ok:** as 4 linhas de `pedidos_rate_limit` (testes de 11 e 15/09; 4 → 0) e o dia off de 22/09/2026 com observação "testeee" (teste manual pelo admin; `dias_off` 2 → 1).
- **Limpeza feita em 28/09/2026 ~00:10 (Brasília), com ok:** a capa órfã do produto "Teste" (`1789440961806-36hh2pkfzsj.png`, 246 KB, raiz do bucket), depois de conferir que nenhuma linha de `produtos` nem de `produto_fotos` apontava para ela. Bucket: 18 → 17 arquivos; `scripts/arquivos-sem-dono.mjs` antes: 1 sem dono; depois: 0.
- **Erro de console no site público (visto em 24/09/2026, não corrigido):** React #418 (a página montada no navegador não bate com o HTML do servidor) na Home e na Lista, em produção. Não vem do banco (essas páginas buscam os dados no servidor). Suspeita não confirmada: o script que a Netlify injeta (`/.netlify/scripts/hud?variant=public`). Os 404 no console são pré-carregamento das rotas reservadas que ainda não existem.
- **Pendência da Fase 4 (SEO):** `main--pingodemell.netlify.app` serve o site de produção sem `X-Robots-Tag: noindex` (conteúdo duplicado para o Google). Registrado em 24/09/2026; não mexer antes da Fase 4.
