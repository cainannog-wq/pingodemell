# Estado técnico — Pingo de Mell

O status do projeto fica fora do repositório; este arquivo registra apenas o estado técnico.

Todo PR que traz migração de schema atualiza este arquivo no mesmo PR (ver CLAUDE.md). Última atualização: 25/09/2026 (créditos da Netlify e fluxo em lote, PR economia-deploys).

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

## Rotas

Site público (`src/app/(site)`):

| Rota | Observação |
|---|---|
| `/` | Home |
| `/produtos` | Lista; filtro `?categoria=bolos\|doces\|salgados\|bebidas` |
| `/politica-de-privacidade` | |
| `/produtos/{id}`, `/carrinho`, `/quem-somos`, `/quem-somos#contato` | reservadas em `src/lib/site/rotas.ts`; ainda caem na 404 |

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

Arquivos no bucket: capa do produto na raiz (`{timestamp}-{aleatório}.{ext}`, gravada pela Server Action com a sessão do admin); fotos extras em `galeria/{produto_id}/{uuid}.webp|jpg` (envio pelo navegador com token assinado por caminho; listar/apagar pelo servidor com a service role, só dentro dessa pasta — `src/lib/galeria/storage-servidor.ts`). O bucket não tem limite de tamanho nem de tipo de arquivo; o limite fica no código.

Limite aceito: a RLS de `produto_fotos` esconde a lista de fotos de produto inativo, não os arquivos; quem tem a URL do arquivo continua abrindo (como a capa).

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

Padrão para objeto novo: desde `seguranca-api.sql`, toda função nova criada pelo papel `postgres` nasce sem EXECUTE para PUBLIC, anon e authenticated (antes nascia executável por eles) (funções criadas pelo painel da Supabase, papel `supabase_admin`, continuam com o padrão antigo). Tabela nova continua nascendo com todas as permissões para anon e authenticated, protegida só pela RLS — a migração que cria a tabela tira o que não é preciso (ver CLAUDE.md).

## Verificador de segurança do Supabase (security advisors)

Agora (24/09/2026 23:55 UTC, verificador real, depois de `seguranca-api.sql`): INFO RLS sem política em `heartbeat` e `pedidos_rate_limit` (intencional: só a chave de serviço, e anon/authenticated nem têm permissão nelas); WARN proteção de senha vazada desligada (configuração do Auth, fora da migração).

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

Testes de banco: `scripts/banco/`, cada um numa transação desfeita no fim, conectando direto no Postgres (`SUPABASE_DB_URL`, Session pooler). Simulam o papel da API (anon, authenticated, service_role) como o PostgREST faz, então valem para o que está de fato em produção. `--com-migracao` roda `supabase/seguranca-api.sql` dentro da mesma transação desfeita, antes das verificações (prova de migração antes de aplicar).

| Script | Prova | Banco | Grava? |
|---|---|---|---|
| `node scripts/banco/rodar-todos.mjs [--com-migracao]` | roda todos abaixo e compara o banco antes e depois (linhas e conteúdo de cada tabela de `public`, contagens de storage e auth, contadores) | produção, só leitura para a comparação | não (falha se algo mudar) |
| `scripts/banco/permissoes.mjs` | permissões de cada papel em cada tabela e função, contador de pedido, padrão de função nova, RLS em tabela nova, storage sem política para anon, alertas de banco do verificador | produção, transação desfeita | não |
| `scripts/banco/produtos.mjs` | RLS de `produtos` e `produto_fotos`; admin lê/insere/altera/apaga; gatilhos `produtos_set_atualizado_em` e `produto_fotos_limite`; `salvar_produto_fotos` | produção, transação desfeita | não |
| `scripts/banco/produto-cento-itens.mjs` | RLS de `produto_cento_itens` | produção, transação desfeita | não |
| `scripts/banco/dias-off.mjs` | RLS de `dias_off` e `segunda_reaberturas` | produção, transação desfeita | não |
| `scripts/banco/pedidos.mjs` | ninguém da API grava direto; servidor grava (cópia da tabela, contador próprio); status inicial; totais recalculados; número não forjável; anon não lê/altera/apaga; admin lê/altera/apaga; gatilho de status | produção, transação desfeita | não (não usa o contador real) |
| `scripts/banco/limite-pedidos.mjs` | anon/logado não chamam `registrar_tentativa_pedido`; servidor: 6ª tentativa bloqueada, IPs independentes, janela recomeça | produção, transação desfeita | não |
| `scripts/banco/http-sem-gravar.mjs` | camada HTTP com a chave anônima: chamadas que nunca gravam (função por GET, que roda só leitura; insert com valor inválido; update/delete de id inexistente) | produção, pela API | não |
| `npm run test` (vitest) | regras, telas, Server Actions e `POST /api/pedidos` (IP da Netlify, X-Forwarded-For ignorado em produção, 429, gravação só pela chave de serviço) com banco simulado. Roda duas vezes, nos fusos UTC e America/Sao_Paulo; testes com "hoje" fixam o relógio (`RELOGIO_TESTE=<instante>` fixa o da suíte inteira) | nenhum (não acessa rede) | não |
| `scripts/netlify/ignorar-build.mjs` | não é teste: regra de ignorar build da Netlify (roda antes de cada build). A regra é testada por `npm run test` (`scripts/netlify/ignorar-build.test.mjs`, com um repositório git temporário) | nenhum | não |
| `scripts/ver-fotos-anonimo.mjs <id>` | lista, como anônimo, as fotos extras de um produto na ordem | produção, pela API | não (só leitura) |
| `scripts/test-turnstile-verify.mjs` | secret key do Turnstile ativa | Cloudflare | não |
| `scripts/check-service-key-bundle.mjs` | a service role key não aparece em `.next/static` (rodar depois do build) | nenhum (arquivos locais) | não |
| `scripts/test-auth-rate-limit.mjs` | limite de tentativas de login do Supabase Auth | Auth de produção | não grava dados; **manual**: tentativas de login seguidas podem bloquear o login do seu IP por alguns minutos |

Última rodada contra produção (24/09/2026, depois da aplicação, sem `--com-migracao`): os 6 testes de banco 92/92, `http-sem-gravar.mjs` 15/15, banco idêntico antes e depois, contador de pedidos em 1047.

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
- Fluxo (regras no CLAUDE.md): a homologação está sempre com "o PR em validação" ou "igual à produção"; um PR por vez; o Cainan só valida depois de "homologação = commit X do PR Y", conferido na lista de deploys da Netlify.
  - Levar um PR: `git push --force-with-lease origin <branch-do-pr>:homologacao`
  - Voltar para a produção: `git push --force-with-lease origin origin/main:homologacao`
  - Enquanto valer o fluxo em lote: "igual à produção" vira "igual à `lote`" (`git push --force-with-lease origin origin/lote:homologacao`).
- Criada em 24/09/2026 igual à `main` (`a828567`), deploy `6ab5cf7f…`.
- PRs contra a `lote` provavelmente não ganham Deploy Preview (a Netlify gera preview para PRs contra a `main`); a validação é na homologação de qualquer jeito.

## Créditos da Netlify

Regras no CLAUDE.md ("Regra de custo — créditos da Netlify e merges em lote").

- Conta `cainannog-wq`, plano **Free: 300 créditos por ciclo**, sem cobrança extra: quando acabam, **os 6 sites da conta saem do ar** (pingodemell, restospsicanaliticos, dudatortatosite, reliable-pixie-4e7fd7, msclicksfotografia, dudatortato) até o ciclo virar. Todos dividem o mesmo saldo.
- Ciclo atual: **20/09 a 19/10/2026**. Saldo em 25/09/2026 ~11:15 (Brasília): **45,3 de 300**.
- Custo (documentação da Netlify): deploy de produção publicado = 15 créditos; Deploy Preview, branch deploy, build pulado e build que falha = 0. Também custam: requisições web (2 por 10 mil), banda (20 por GB) e compute (10 por GB-hora), inclusive nos previews e na homologação.
- Gasto do ciclo até 25/09: 16 deploys de produção do pingodemell (240), banda 6,6, compute 4,9, requisições 3,3; total 254,7. Dos 16 deploys: 13 merges de PR (#1, #2, #3, #6 a #15) e 3 commits do heartbeat (1 agendado, 2 rodados à mão em 24/09). A regra de ignorar build teria pulado 5 deles: #7 (só `CLAUDE.md`), #8 (só `.gitignore`) e os 3 do heartbeat.
- Heartbeat: agendado a cada 3 dias (dias 1, 4, 7… do mês, 06:00 UTC). Sem a marcação, cada execução fazia um deploy de produção (15 créditos); até 19/10 seriam mais 7 (105), o suficiente para zerar o saldo por volta de 04/10. Desligado com `gh workflow disable` em 25/09/2026 ~11:20 (Brasília), antes da correção.
- Economia (PR economia-deploys): commit do heartbeat com `[skip netlify]`; regra de ignorar build em `netlify.toml` (`scripts/netlify/ignorar-build.mjs`, teste em `scripts/netlify/ignorar-build.test.mjs`). Continuam gerando deploy: `src/`, `public/`, `package.json`, `package-lock.json`, `next.config.ts`, `netlify.toml`, `tsconfig.json`, `eslint.config.mjs`, `vitest.config.ts`, `vitest.setup.ts`, arquivos de teste fora de `scripts/` (`*.test.ts(x)`) e `supabase/prod-ca.crt`. Sem commit anterior para comparar (primeiro build da branch, "Clear cache and deploy", "Trigger deploy" do mesmo commit) ou se o `git diff` falhar, a regra builda.
- Provas na homologação (25/09/2026, antes do merge): commit vazio com `[skip netlify]` (`5446c15`) não criou deploy nenhum (a lista da Netlify não tem status "Skipped": o commit simplesmente não aparece); commit só em `docs/` (`2612f51`) virou deploy "Canceled" ("Canceled build due to no content change", log `ignorar-build: só arquivos fora do site mudaram`); commit em `src/` (`605f9f7`) buildou normalmente.
- Como a Netlify conta (observado em 25/09/2026): o saldo leva minutos para refletir um deploy; ler só uns 30 minutos depois. Às 11:13 (Brasília), um minuto depois do deploy de produção do #15, o painel mostrava 16 deploys de produção e 45,3 créditos; a partir de ~11:37, 17 deploys e 29,9, e assim ficou até ~14:50 (29,7), mesmo com 4 builds que não são de produção concluídos no meio (Deploy Preview #16 e 3 branch deploys da homologação) e 1 cancelado. Deploy Preview e branch deploy **não** são cobrados (seriam +60). A lista de deploys de produção do ciclo tem 16 (13 merges de PR e 3 heartbeats), e o contador marca 17: 1 deploy (15 créditos) cobrado sem correspondente na lista, sem explicação. Nenhum dos outros 5 sites publicou nada desde 24/09 23:00 UTC (lista de builds da equipe e último deploy publicado de cada um: restospsicanaliticos ~14/09, dudatortatosite ~20/08, reliable-pixie-4e7fd7 ~13/08, msclicksfotografia ~04/08, dudatortato ~julho).

## Registros

- **Número de pedido 1047 gasto em 24/09/2026**, numa transação desfeita que provou que o anônimo gravava direto em `pedidos` (o contador não volta com o rollback). O próximo pedido real será o 1048; não existe pedido 1047.
- **Limpeza feita em 25/09/2026 ~00:00 UTC, com ok:** as 4 linhas de `pedidos_rate_limit` (testes de 11 e 15/09; 4 → 0) e o dia off de 22/09/2026 com observação "testeee" (teste manual pelo admin; `dias_off` 2 → 1).
- **Erro de console no site público (visto em 24/09/2026, não corrigido):** React #418 (a página montada no navegador não bate com o HTML do servidor) na Home e na Lista, em produção. Não vem do banco (essas páginas buscam os dados no servidor). Suspeita não confirmada: o script que a Netlify injeta (`/.netlify/scripts/hud?variant=public`). Os 404 no console são pré-carregamento das rotas reservadas que ainda não existem.
- **Pendência da Fase 4 (SEO):** `main--pingodemell.netlify.app` serve o site de produção sem `X-Robots-Tag: noindex` (conteúdo duplicado para o Google). Registrado em 24/09/2026; não mexer antes da Fase 4.
