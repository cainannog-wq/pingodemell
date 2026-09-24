# Estado técnico — Pingo de Mell

O status do projeto fica fora do repositório; este arquivo registra apenas o estado técnico.

Todo PR que traz migração de schema atualiza este arquivo no mesmo PR (ver CLAUDE.md). Última atualização: 24/09/2026 (PR `galeria-admin`).

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

## Rotas

Site público (`src/app/(site)`):

| Rota | Observação |
|---|---|
| `/` | Home |
| `/produtos` | Lista; filtro `?categoria=bolos\|doces\|salgados\|bebidas` |
| `/politica-de-privacidade` | |
| `/produtos/{id}`, `/carrinho`, `/quem-somos`, `/quem-somos#contato` | reservadas em `src/lib/site/rotas.ts`; ainda caem na 404 |

Admin (exige login; `src/app/admin`): `/login`, `/admin`, `/admin/produtos`, `/admin/produtos/novo`, `/admin/produtos/{nome}`, `/admin/pedidos`, `/admin/pedidos/{numero}`, `/admin/dias-off`.

API: `POST /api/pedidos` (insert público de pedido, com limite por IP em `pedidos_rate_limit`).

## RLS em vigor (conferido em produção em 24/09/2026)

RLS ativa em todas as tabelas de `public`.

| Tabela | Leitura | Escrita |
|---|---|---|
| `produtos` | anon: só `ativo = true`; authenticated: todos | insert/update/delete: authenticated |
| `produto_cento_itens` | pública (todos) | insert/update/delete: authenticated |
| `produto_fotos` | anon: só fotos de produto com `ativo = true` (condição na própria política); authenticated: todas | insert/update/delete: authenticated. anon sem privilégio de insert/update/delete/truncate; truncate revogado também de authenticated |
| `pedidos` | authenticated | insert: público, só com `status = 'aguardando_confirmacao'`; update/delete: authenticated |
| `pedidos_rate_limit` | nenhuma política (só service role) | nenhuma política (só service role) |
| `heartbeat` | nenhuma política (só service role) | nenhuma política (só service role) |
| `dias_off`, `segunda_reaberturas` | pública | insert/update/delete: authenticated |
| `storage.objects` (bucket público `Pingo de Mell`) | **sem política de SELECT**: arquivos abertos pela URL pública do bucket; a sessão logada não lista nem enxerga objetos | insert/update/delete: authenticated, `bucket_id = 'Pingo de Mell'` (na prática o delete com a sessão logada não apaga nada, porque sem SELECT a linha não é visível) |

Arquivos no bucket: capa do produto na raiz (`{timestamp}-{aleatório}.{ext}`, gravada pela Server Action com a sessão do admin); fotos extras em `galeria/{produto_id}/{uuid}.webp|jpg` (envio pelo navegador com token assinado por caminho; listar/apagar pelo servidor com a service role, só dentro dessa pasta — `src/lib/galeria/storage-servidor.ts`).

Limite aceito: a RLS de `produto_fotos` esconde a lista de fotos de produto inativo, não os arquivos; quem tem a URL do arquivo continua abrindo (como a capa).

## Funções e gatilhos em `public`

| Função | Segurança | Executável por | Uso |
|---|---|---|---|
| `salvar_produto_fotos(uuid, jsonb)` | INVOKER | authenticated (não anon) | grava a galeria de um produto numa transação |
| `produto_fotos_limite()` | INVOKER | ninguém direto (gatilho) | gatilho `produto_fotos_limite` (máx. 9 fotos extras) |
| `produtos_set_atualizado_em()` | INVOKER | padrão | gatilho `produtos_set_atualizado_em` (todo update em `produtos`) |
| `pedidos_recalcular_totais()` | INVOKER | padrão | gatilho `trg_pedidos_recalcular_totais` |
| `pedidos_set_status_atualizado_em()` | INVOKER | padrão | gatilho `trg_pedidos_status_atualizado_em` |
| `registrar_tentativa_pedido(...)` | DEFINER | anon e authenticated | limite por IP de `POST /api/pedidos` |
| `rls_auto_enable()` | DEFINER | — (event trigger) | liga RLS em tabela nova |

## Scripts de teste

Todos rodam contra o banco único de produção (`SUPABASE_URL` do `.env.local`). "Grava" = cria dado temporário em produção (e apaga no fim) — não rodar sem combinar.

| Script | Prova | Grava em produção? |
|---|---|---|
| `npm run test` (vitest) | regras, telas e Server Actions com banco simulado | não (não acessa rede) |
| `scripts/test-rls.mjs` | RLS de `produtos` (anon lê só ativo, logado lê todos, anon não escreve) | não (só se a RLS falhar) |
| `scripts/test-rls-fotos.mjs` | RLS de `produto_fotos` com os produtos fixos de teste | não (só leitura) |
| `scripts/ver-fotos-anonimo.mjs <id>` | lista, como anônimo, as fotos extras de um produto na ordem | não (só leitura) |
| `scripts/test-rls-produto-cento-itens.mjs` | RLS de `produto_cento_itens` | **sim** (2 produtos + itens temporários) |
| `scripts/test-rls-pedidos.mjs` | RLS de `pedidos` | **sim** (1 pedido temporário) |
| `scripts/test-rls-dias-off.mjs` | RLS de `dias_off` e `segunda_reaberturas` | **sim** (registros temporários) |
| `scripts/test-mass-assignment-pedidos.mjs` | insert anônimo de pedido não forja status/id/totais | **sim** (pedidos temporários) |
| `scripts/test-rate-limit-pedidos.mjs` | limite por IP de `POST /api/pedidos` (local ou deploy) | **sim** (pedidos temporários) |
| `scripts/test-rate-limit-netlify.mjs` | limite por IP no deploy da Netlify, sem spoofing de IP | **sim** (pedidos temporários) |
| `scripts/test-auth-rate-limit.mjs` | limite de tentativas de login do Supabase Auth | não (tentativas de login) |
| `scripts/test-turnstile-verify.mjs` | secret key do Turnstile ativa | não (chama a Cloudflare) |
| `scripts/check-service-key-bundle.mjs` | a service role key não aparece em `.next/static` (rodar depois do build) | não (só arquivos locais) |

Os scripts com sessão logada (`test-rls.mjs`, `test-rls-fotos.mjs` e os que gravam) criam uma sessão no Auth via link mágico da Admin API (`TEST_ADMIN_EMAIL`).
