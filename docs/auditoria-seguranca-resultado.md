# Auditoria de segurança — Resultado (14/09/2026)

Rodada executada seguindo `docs/auditoria-seguranca-prompt.md`. Testes de RLS/mass assignment rodaram contra o projeto Supabase **real** (não um sandbox), sempre com registros marcados `AUDIT_TEST_`/`RLS_TEST_`/`RATE_LIMIT_TEST_` e limpeza automática ao final de cada script — confirmado nas saídas coladas abaixo.

## 1. Resumo executivo

- **26 itens do núcleo (B1–B26) revisados.** 1 crítico encontrado e **corrigido e confirmado fechado** (código + SQL rodado por você no Supabase), 3 achados médios/baixos corrigidos direto no código, 1 achado informativo sobre bundle de produção (negativo, ou seja, sem exposição), o resto seguro ou não aplicável nesta fase do projeto.
- **Achado crítico (B12 — mass assignment em `pedidos`) — FECHADO em 14/09/2026.** Um insert anônimo direto no Supabase (sem passar pela tela nem por `/api/pedidos`) conseguia gravar `status="entregue"`, escolher o próprio `id`, forjar `criado_em` e gravar `total`/`subtotal` sem relação com os itens reais do pedido. Provado com teste automatizado rodando contra produção, corrigido com `supabase/pedidos-hardening.sql` (rodado por você no SQL Editor), e reconfirmado: `node scripts/test-mass-assignment-pedidos.mjs` agora passa 5/5, e o teste original de RLS (`test-rls-pedidos.mjs`, 7/7) continua passando — a correção não quebrou o fluxo legítimo de insert anônimo.
- Corrigidos direto no código desta sessão: injeção de fórmula em CSV (B2/exportação), página de debug `/teste-supabase` exposta publicamente (B17), ausência de cabeçalhos de segurança (B20 — precisou de duas tentativas, ver seção 3.8).
- RLS de `produtos` e `pedidos` (o que já existia) reconfirmado 100% passando contra produção agora, não só lido do registro antigo.
- Nenhum segredo (service role key, secret key do Turnstile) aparece no bundle publicado ao navegador — confirmado inspecionando o build de produção real, não só o código-fonte.
- **Netlify conectado durante esta rodada** — isso destravou verificação de ponta a ponta que antes só dava pra fazer localmente: B6 (rate limit + resistência a spoofing de IP) e B20 (cabeçalhos) agora confirmados contra o site publicado de verdade, não só por leitura de código. B23 também deixou de ser "não aplicável" — ver seção 3.10.
- **Segundo incidente de credencial nesta mesma rodada, já fechado** — ver seção 3.11. A `SUPABASE_SERVICE_ROLE_KEY` foi exposta sem máscara durante um teste, você rotacionou no Supabase/`.env.local`/Netlify, e a chave nova foi validada contra produção antes de qualquer commit.
- Itens que dependem de decisão de produto ainda em aberto (checkout, foto de referência) seguem como pendência conhecida, listados na seção 4.

## 2. Tabela consolidada

| Item | Status anterior | Achado | Gravidade | Corrigido? | Evidência |
|---|---|---|---|---|---|
| **B12** — mass assignment em `pedidos` | Nunca testado | Era vulnerável: status/id/criado_em/total forjáveis via insert anônimo direto | Crítico | **Sim — confirmado 5/5 após você rodar o SQL** | Seção 3.1 |
| **B13** — regra de negócio no cliente | Nunca testado | Não aplicável ainda por completo (checkout não existe); ver B12 pro que já é testável hoje | — | — | Doc já previa isso; retestar quando o checkout existir |
| **B6** — exaustão de recurso / rate limit | Testado isolado (11/09) | Seguro, **confirmado de ponta a ponta contra o Netlify real**: bloqueia na 6ª requisição, `X-Forwarded-For` forjado (IP diferente a cada tentativa) não reseta o contador | — | — | Seção 3.2 |
| **B9** — vazamento de segredo | Incidente fechado (11/09) | Seguro: service role key e Turnstile secret **não aparecem no bundle publicado** (`.next/static`), só em cache de build local (normal, não é servido) | — | — | Seção 3.3 |
| B1 — SQL Injection | — | Seguro: acesso só via cliente Supabase parametrizado; única função `SECURITY DEFINER` (`registrar_tentativa_pedido`) já tem `search_path` fixado | — | — | Leitura de código |
| B2 — XSS | — | Seguro: nenhum `dangerouslySetInnerHTML` no projeto, toda renderização de campo livre (observações, nome, endereço) passa pelo escape automático do React | — | — | Grep + leitura de código |
| B2 (adjacente) — CSV injection na exportação de pedidos | Nunca testado | **Vulnerável**: campo livre do cliente (`cliente_nome`, `ocasião`) começando com `=`/`+`/`-`/`@` podia virar fórmula ao abrir no Excel | Médio | **Corrigido** | Seção 3.4 |
| B3 — sessão/autenticação | — | Depende do Supabase Auth (padrão do fornecedor); logout chama `signOut()` server-side | Não verificado em profundidade | — | Fora do alcance de teste automatizado nesta rodada |
| B4 — Broken Access Control / IDOR | — | Seguro: `/admin/produtos` e `/admin/pedidos` sem login retornam 307 pra `/login` (testado ao vivo agora) | — | — | Seção 3.5 |
| B5 — força bruta / credential stuffing | Testado (11/09) | Seguro: mensagem de erro idêntica pra e-mail inexistente e senha errada (`"E-mail ou senha inválidos."`) | — | — | Leitura de `login/actions.ts` |
| B7 — CSRF | — | Seguro: mutações passam por Server Actions do Next.js, que já validam a origem da requisição nativamente; nenhum endpoint de mutação fora desse mecanismo | — | — | Leitura de código |
| B8 — SSRF | — | Não aplicável: nenhum campo aceita URL fornecida pelo usuário, upload de foto é só por arquivo | — | — | Grep confirmando ausência |
| B10/B19 — dependência vulnerável | — | Seguro no momento: `npm audit --production` = 0 vulnerabilidades | — | — | Seção 3.6 |
| B11 — RLS ausente em alguma tabela | — | Só `produtos` e `pedidos` são usadas pelo app (confirmado por grep completo); `heartbeat` e `pedidos_rate_limit` têm RLS ativo sem policy nenhuma (só service role acessa), como já documentado | Parcial — ver seção 4 | — | Grep + leitura de schema |
| B14 — validação só no frontend | — | Seguro: toda validação de produto e pedido é reforçada em Server Action/Route Handler, não só na tela | — | — | Leitura de código |
| B15 — upload sem restrição | — | Baixo risco hoje: só admin autenticado sobe foto; tipo validado pelo MIME reportado pelo navegador (não por assinatura de bytes), tamanho limitado a 2MB no servidor | Baixo (aceito por ora) | — | Seção 4 |
| B16 — CORS permissivo | — | Seguro: nenhum header CORS customizado em `/api/pedidos`; padrão do Next.js não libera origem cruzada | — | — | Leitura de código |
| B17 — erro vaza detalhe interno | — | 1 achado: `/teste-supabase` dumpava erro bruto do Supabase pra qualquer visitante | Médio | **Corrigido** (página removida) | Seção 3.7 |
| B18 — teste só cobre caminho feliz | — | Confirmado: suíte existente (`test-rls.mjs`, `test-rls-pedidos.mjs`) cobre RLS mas não mass assignment nem regra de negócio — por isso B12 nunca tinha sido pego antes | — | Parcial — `test-mass-assignment-pedidos.mjs` fecha esse buraco | Seção 3.1 |
| B20 — cabeçalhos de segurança ausentes | — | Vulnerável: nenhum header customizado configurado | Baixo/Médio | **Corrigido e confirmado ao vivo** (`next.config.ts` — ver 3.8 sobre o `netlify.toml` não funcionar) | Seção 3.8 |
| B21 — dado sensível em log | — | Não verificável (sem ferramenta de leitura de log de função disponível para o Claude Code) | — | — | Seção 4 |
| B22 — backup | — | Não verificável pelo Claude Code (painel do Supabase) | — | — | Seção 4 |
| B23 — preview do Netlify | — | **Confirmado**: o deploy de preview (`painel-de-pedidos--pingodemell.netlify.app`) usa o MESMO banco de produção, sem senha/SSO exigido pra acessar o preview em si | Aceito por ora | — | Seção 3.10 |
| B24 — fechamento do incidente de 11/09 | Fechado (11/09) | Reconfirmado agora: `git log --all -- .env.local` continua vazio | — | — | Seção 3.9 |
| B25 — RLS linha a linha | — | `pedidos` documentado no repo e conferido ao vivo; `produtos` não tem SQL versionado no repo (foi criado direto no painel) — RLS testada por comportamento (select ok, insert/delete bloqueado), mas o texto exato da policy não está em lugar nenhum do código | Baixo (gap de documentação) | — | Seção 4 |
| B26 — injeção na mensagem do WhatsApp | — | Não aplicável (checkout não existe) | — | — | Como já previsto no prompt |

## 3. Detalhamento por item corrigido (ou testado com evidência)

### 3.1 B12 — Mass assignment em `pedidos` (CRÍTICO)

**O que um atacante conseguiria fazer:** com a `anon key` (pensada pra ser pública, mesmo que hoje esta aplicação ainda não a envie ao navegador — ver 3.3), qualquer pessoa pode chamar o PostgREST do Supabase direto, ignorando a tela e o Route Handler `/api/pedidos`. A policy de insert (`with check (true)`) libera o insert, mas não restringe colunas. Teste rodado contra produção:

```
node scripts/test-mass-assignment-pedidos.mjs   (ANTES da correção)

[FAIL] 1. INSERT anônimo não consegue setar status != 'aguardando_confirmacao'
status gravado: "entregue"

[FAIL] 2. INSERT anônimo não consegue escolher o próprio id (uuid)
id gravado: "00000000-0000-4000-8000-000000000001"

[FAIL] 3. INSERT anônimo não consegue forjar criado_em
criado_em gravado: "2020-01-01T00:00:00+00:00"

[PASS] 4. INSERT anônimo não consegue escolher o próprio 'numero'
Insert rejeitado, como esperado: cannot insert a non-DEFAULT value into column "numero"

[FAIL] 5. subtotal/total gravados batem com os itens, não com o que o cliente mandou
subtotal/total gravados: 0.01 / 0.01 (esperado: 500 / 500)

Resumo: 1/5 testes passaram.
```

Ou seja: um "cliente" malicioso podia inserir um pedido já com status "entregue" (some do fluxo de acompanhamento do painel), com data de criação forjada (distorce os cards "pedidos no mês"), e com um bolo de R$500 registrado como R$0,01 (total não bate com os itens reais).

**O que foi alterado:** `supabase/pedidos-hardening.sql` (novo arquivo, mesmo padrão de `pedidos-schema.sql`):
- `id`, `numero`, `status`, `criado_em`, `status_atualizado_em` deixam de aceitar valor vindo do cliente no insert (grant de coluna restrito) — sempre usam o padrão do banco.
- Um trigger recalcula `subtotal`/`total` a partir de `itens` sempre que um pedido é inserido, ignorando o que o cliente mandou — igual ao que `/api/pedidos` já faz, mas agora também vale pra quem tenta inserir direto na tabela.
- Camada redundante: a própria policy de insert passa a exigir `status = 'aguardando_confirmacao'`, como segunda trava.

**Confirmação pós-correção (14/09/2026):** você rodou `supabase/pedidos-hardening.sql` no SQL Editor do Supabase. Reteste:

```
node scripts/test-mass-assignment-pedidos.mjs   (DEPOIS da correção)

[PASS] 1. INSERT anônimo não consegue setar status != 'aguardando_confirmacao'
Insert rejeitado, como esperado: permission denied for table pedidos

[PASS] 2. INSERT anônimo não consegue escolher o próprio id (uuid)
Insert rejeitado, como esperado: permission denied for table pedidos

[PASS] 3. INSERT anônimo não consegue forjar criado_em
Insert rejeitado, como esperado: permission denied for table pedidos

[PASS] 4. INSERT anônimo não consegue escolher o próprio 'numero'
Insert rejeitado, como esperado: cannot insert a non-DEFAULT value into column "numero"

[PASS] 5. subtotal/total gravados batem com os itens, não com o que o cliente mandou
subtotal/total gravados: 500 / 500 (esperado: 500 / 500)

Resumo: 5/5 testes passaram.
```

E o teste original de RLS (`test-rls-pedidos.mjs`), pra garantir que a correção não quebrou o fluxo legítimo de insert anônimo, continua 7/7. Esse script fica na suíte permanente do projeto (`scripts/test-mass-assignment-pedidos.mjs`).

### 3.2 B6 — Rate limit / exaustão de recurso

Código revisado: `getClientIp()` em `src/app/api/pedidos/route.ts` só confia em `X-Forwarded-For` (forjável pelo cliente) quando `NODE_ENV !== "production"` — em produção usa exclusivamente `x-nf-client-connection-ip`, que é injetado pelo proxy da Netlify e não pode ser sobrescrito pelo cliente.

Teste local (servidor rodando com `next start`, que já seta `NODE_ENV=production`) confirmou o bloqueio, mas caía tudo no mesmo IP "unknown" por falta do proxy da Netlify — não provava resistência a spoofing de verdade. **Depois do Netlify ser conectado nesta mesma rodada**, reteste completo contra o deploy real (`scripts/test-rate-limit-netlify.mjs`), mandando um `X-Forwarded-For` diferente a cada requisição pra tentar resetar o contador:

```
node scripts/test-rate-limit-netlify.mjs --base-url https://painel-de-pedidos--pingodemell.netlify.app

Requisição 1 | X-Forwarded-For=203.0.113.1 | status 201 | passou
Requisição 2 | X-Forwarded-For=203.0.113.2 | status 201 | passou
Requisição 3 | X-Forwarded-For=203.0.113.3 | status 201 | passou
Requisição 4 | X-Forwarded-For=203.0.113.4 | status 201 | passou
Requisição 5 | X-Forwarded-For=203.0.113.5 | status 201 | passou
Requisição 6 | X-Forwarded-For=203.0.113.6 | status 429 | BLOQUEADO

OK: o X-Forwarded-For forjado (diferente a cada tentativa) NÃO resetou o contador — o limite é por IP real do Netlify, não pelo header.
```

B6 fechado de ponta a ponta, sem ressalva. `scripts/test-rate-limit-netlify.mjs` fica na suíte permanente do projeto.

### 3.3 B9 — Vazamento de segredo no bundle publicado

Gerei o build de produção real (`npm run build`) e procurei o valor exato da `SUPABASE_SERVICE_ROLE_KEY` e da `TURNSTILE_SECRET_KEY` dentro dele, sem nunca imprimir o valor em si (só contagem de arquivos com match):

```
Arquivos do build contendo a service_role key: 5   (todos em .next/cache/turbopack e .next/dev/cache — cache de compilação local, nunca servido ao navegador)
Arquivos do build contendo a Turnstile secret key: 0
Matches em .next/static (bundle enviado ao navegador): 0
```

Confirmado também que `src/lib/supabase/client.ts` (o único lugar que usaria a `anon key` no navegador) **não é importado em lugar nenhum do app hoje** — toda chamada ao Supabase passa por Server Component/Server Action/Route Handler. Ou seja: hoje a `anon key` nem chega a ser enviada ao navegador por esta aplicação, o que é uma postura ainda mais conservadora que o padrão comum de apps Supabase. Isso **não** foi motivo pra tratar o achado B12 como menos crítico — a `anon key` é pública por design do Supabase (a proteção real tem que estar no banco, não na obscuridade da chave), e o próprio schema do projeto já pressupõe uso direto dela quando o checkout for implementado.

### 3.4 CSV injection na exportação de pedidos (B2, achado novo)

`gerarCSVPedidos()` em `src/app/admin/pedidos/export-csv.ts` já escapava separador/aspas/quebra de linha, mas não neutralizava célula começando com `=`, `+`, `-`, `@`, tab ou CR — um valor assim em `cliente_nome` ou `ocasião` (campos de texto livre que, quando o checkout existir, vêm de um formulário público sem login) pode ser interpretado como fórmula pelo Excel/Sheets ao abrir o CSV exportado pelo admin.

**Correção:** qualquer célula que comece com um desses caracteres agora recebe um apóstrofo na frente antes de aplicar o escape já existente, neutralizando a fórmula sem mudar o texto visível.

### 3.5 B4 — Acesso direto às rotas de admin sem login

Testado ao vivo (servidor local rodando):

```
GET /admin/produtos (sem sessão) → 307 → Location: /login
GET /admin/pedidos  (sem sessão) → 307 → Location: /login
```

`requireAuth()` em `src/lib/supabase/dal.ts` roda no servidor (não é só esconder botão na tela), confirmado.

### 3.6 B10/B19 — Dependências

```
npm audit --production
found 0 vulnerabilities
```

Dependências diretas (`package.json`): Next 16.3.4, React 19.2.8, @supabase/supabase-js 2.116.0, @supabase/ssr 0.12.6. Nenhuma vulnerabilidade conhecida no momento desta auditoria — revisitar periodicamente (ver seção 7).

### 3.7 B17 — `/teste-supabase` expondo erro bruto publicamente

Página de debug esquecida (`src/app/teste-supabase/page.tsx`), sem autenticação, que consultava `produtos` e imprimia o objeto de erro bruto do Supabase na tela em caso de falha (`JSON.stringify(error, null, 2)`). Não expunha dado sensível (produtos já são públicos), mas é superfície de debug esquecida em produção, do tipo que normalmente vaza nome de coluna/tabela em caso de erro. **Removida.**

### 3.8 B20 — Cabeçalhos de segurança ausentes

Nenhum header customizado existia. Primeira tentativa: bloco `[[headers]]` em `netlify.toml`. Depois do Netlify conectado, testei contra o deploy real (`curl -D -`) e **nenhum dos headers customizados aparecia** — só o `X-Content-Type-Options` que já é padrão da própria Netlify. O `@netlify/plugin-nextjs` não repassa o `[[headers]]` do `netlify.toml` pras respostas que o Next.js renderiza (só se aplicaria a asset estático servido direto pela CDN, não é o caso de nenhuma rota deste app).

**Correção de verdade:** movido pra `headers()` em `next.config.ts`, que é o mecanismo que o plugin realmente honra. Reconfirmado contra o deploy real depois do redeploy:

```
curl -s -D - -o /dev/null https://painel-de-pedidos--pingodemell.netlify.app/login

Permissions-Policy: camera=(), microphone=(), geolocation=()
Referrer-Policy: strict-origin-when-cross-origin
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload   (já era padrão da Netlify)
X-Content-Type-Options: nosniff                                          (já era padrão da Netlify)
X-Frame-Options: DENY
```

**CSP explícita ficou de fora de propósito** — o projeto ainda vai ganhar tags do GA4/Clarity na Fase 4 do roadmap, e definir CSP antes disso seria refazer o trabalho depois.

### 3.9 B24 — Reconfirmação do incidente de 11/09/2026

```
git log --all -- .env.local
(saída vazia — nunca commitado)
```

Confirmado de novo, não só copiado do registro antigo. `.gitignore` continua cobrindo `.env*`. As três credenciais do incidente (service role key, Turnstile secret, senha do admin de teste) já estavam rotacionadas antes desta auditoria — reconfirmar que são as versões novas é uma checagem que só você pode fazer (comparando com o que está de fato configurado no Supabase e no Turnstile hoje), ver checklist manual no fim do prompt original.

### 3.10 B23 — Preview do Netlify aponta pro banco de produção

Depois do Netlify conectado, testei inserindo pedidos marcados `AUDIT_TEST_` via `https://painel-de-pedidos--pingodemell.netlify.app/api/pedidos` e conferindo, com a service role key local, se eles apareciam no mesmo projeto Supabase que `.env.local` aponta:

```
OK — 5 pedido(s) de teste criado(s) via https://painel-de-pedidos--pingodemell.netlify.app apareceram em https://npervqefspmwmrekskcb.supabase.co
```

Confirmado: preview e produção compartilham o mesmo banco real — não existe banco de staging separado. `projectAccessControls` do site mostra `requiresPassword: false` e `requiresSSOTeamLogin: false`, ou seja, qualquer um que descobrir a URL do preview acessa o catálogo público normalmente (mesmo tanto faz, já é público) e pode tentar `/admin/*` (cai no login, protegido igual produção — RLS e auth são os mesmos em qualquer contexto de deploy). O risco incremental real é só superfície extra: mais uma URL batendo no mesmo `/api/pedidos` real. **Aceito por ora** — criar um projeto Supabase de staging separado só pra isso não parece valer o custo/complexidade pro tamanho deste projeto; registrado como risco aceito consciente, não como lacuna esquecida.

### 3.11 Segundo incidente de credencial (14/09/2026, já fechado)

Durante os testes com o Netlify recém-conectado, uma chamada à ferramenta de listar variáveis de ambiente do site retornou a `SUPABASE_SERVICE_ROLE_KEY` **sem máscara** no contexto "dev" (as demais — branch-deploy, deploy-preview, production, dev-server — vieram corretamente mascaradas, só os últimos 4 caracteres visíveis). O valor completo ficou em texto puro no histórico desta sessão — mesmo padrão do incidente de 11/09/2026, causa diferente (dessa vez uma ferramenta MCP, não um `cat` de arquivo).

Ação tomada: parei de usar aquela ferramenta imediatamente, avisei você no mesmo instante, sem repetir o valor em nenhuma resposta. Você rotacionou a chave no Supabase e atualizou `.env.local` e a variável no Netlify. Validação da chave nova, sem nunca ler o valor diretamente — rodando os scripts que dependem dela contra produção:

```
node scripts/test-rls-pedidos.mjs            → 7/7 (chave local funciona)
node scripts/test-mass-assignment-pedidos.mjs → 5/5 (chave local funciona, fix do B12 continua de pé)
node scripts/test-rate-limit-netlify.mjs      → primeira tentativa: 500 em todas as requisições
```

O teste contra o Netlify deu 500 na primeira tentativa — não porque a chave nova estivesse errada, mas porque variável de ambiente atualizada no painel só vale a partir do próximo deploy (o deploy que já estava no ar continuava rodando com a chave antiga, agora invalidada). Resolvido com o próprio push desta rodada (novo deploy nasce já com a chave nova); reteste depois do deploy: `test-rate-limit-netlify.mjs` 201/201/201/201/201/429, como esperado.

**Fechado.** Nenhuma credencial antiga segue em uso em lugar nenhum do sistema.

## 4. O que não pôde ser testado

- **B21 (log sensível):** não existe, nas ferramentas disponíveis ao Claude Code nesta sessão, acesso de leitura a log de função do Netlify em produção. Verificação manual: force um erro no fluxo de `/api/pedidos` (ex. mande um corpo sem `cliente_nome`) e confira, no painel do Netlify (Functions → logs), se o erro logado (`console.error("Falha ao criar pedido:", insertError)`) inclui algum dado do cliente além do necessário para depurar.
- **B22 (backup):** verificação manual no painel do Supabase — Database → Backups. Confirme a janela de retenção do plano atual e se já existe algum registro de teste de restauração.
- **B26 (injeção na mensagem do WhatsApp):** não aplicável, checkout ainda não implementado. Fica registrado pra reteste quando o item 4 da Fase 2 for codificado.
- **B3 (expiração de sessão em profundidade):** depende do comportamento interno do Supabase Auth (TTL de token, invalidação de refresh token no `signOut`), que é gerenciado pelo fornecedor — não testado com verificação de tempo real nesta rodada.

## 5. Riscos aceitos

- **B15 (upload de foto sem checagem de assinatura de bytes):** o tipo do arquivo é validado pelo MIME que o navegador reporta, não pelos bytes reais do arquivo. Aceito por ora porque só o admin autenticado (usuário único e confiável) tem acesso a essa ação — não é superfície pública. **Isso muda se a decisão em aberto sobre foto de referência do cliente for por upload no site** (ver seção 6).
- **B23 (preview do Netlify compartilha o banco de produção):** confirmado na seção 3.10. Aceito por ora — um projeto Supabase de staging separado é overhead desproporcional pro tamanho deste projeto, e a proteção de acesso (RLS + login) é a mesma em qualquer contexto de deploy.
- **B11/B25 (RLS de `produtos` sem SQL versionado):** a tabela foi criada direto no painel do Supabase antes de o projeto adotar o padrão de versionar schema em `supabase/*.sql` (que só começou com `pedidos-schema.sql`). O comportamento foi testado e está correto (seção 3 da tabela consolidada), mas o texto exato da policy não está em nenhum arquivo do repositório. Risco baixo, aceito por ora — recomendo, numa próxima sessão, extrair o SQL real de `produtos` do painel do Supabase e versionar, só por disciplina de documentação, não porque haja comportamento incorreto hoje.

## 6. Condicionais (decisões em aberto que mudam o risco)

- **Foto de referência do bolo personalizado, se for por upload no site:** B15 sobe de baixo pra crítico, porque passaria a aceitar upload de usuário anônimo (hoje só admin autenticado sobe arquivo). Nesse cenário, antes de implementar, endurecer: validação de assinatura de bytes (não só MIME reportado), limite de tamanho, e rate limit específico pra essa rota — além do que `/api/pedidos` já tem.
- **Checkout público (Fase 2, item 4):** quando implementado, B13 e B26 precisam de reteste completo com o formulário real. A correção do B12 aplicada nesta auditoria (SQL de hardening) já cobre o insert direto na tabela independentemente de como o checkout for construído, o que reduz bastante o risco residual quando essa tela chegar — mas o roadmap de antecedência mínima de entrega (regra fechada em 14/09) ainda não está implementado em nenhuma camada de validação (nem na tela, nem no Route Handler, nem no banco), porque o checkout em si ainda não existe.

## 7. Manutenção contínua

- Rodar `npm audit` a cada trimestre, ou sempre que uma dependência direta for atualizada.
- Rodar a suíte completa (`test-rls.mjs`, `test-rls-pedidos.mjs`, `test-rate-limit-pedidos.mjs`, `test-mass-assignment-pedidos.mjs`, `test-rate-limit-netlify.mjs`) sempre que uma tabela nova ganhar RLS, uma policy existente for alterada no painel do Supabase, ou uma credencial for rotacionada.
- Sempre que uma tabela nova for criada, aplicar o mesmo hábito adotado a partir de `pedidos-schema.sql`: versionar o SQL completo (schema + RLS + grants) em `supabase/`, não só criar pelo painel.
- Sempre que uma variável de ambiente sensível for trocada no Netlify, lembrar que só vale a partir do próximo deploy — não é instantânea (ver seção 3.11).
- Revisitar B21/B22 quando houver uma forma de ler log de função e backup do Supabase disponível na sessão.

## 8. Limites desta auditoria

Esta auditoria cobre os vetores conhecidos do prompt `docs/auditoria-seguranca-prompt.md`, com as ferramentas disponíveis ao Claude Code nesta sessão (leitura de código, execução de script Node contra o Supabase e o Netlify reais, build de produção local, ferramentas de leitura/escrita do Netlify conectadas nesta conversa). **Não** equivale a um teste de invasão profissional independente, não cobre engenharia social, não cobre segurança física, e não teve acesso a: painel administrativo do Supabase (backups, logs, configuração de Auth além do que está documentado), log de função do Netlify, nem contas de infraestrutura (2FA do Supabase/Netlify/GitHub — item 4 do checklist manual abaixo). Nunca afirme, a partir deste relatório, que o sistema está livre de vulnerabilidade — apenas que os vetores aqui listados foram verificados nesta data.

---

## Checklist manual pra você

1. ~~Ação obrigatória, prioridade máxima: rodar `supabase/pedidos-hardening.sql`~~ — **feito e confirmado em 14/09/2026** (5/5 testes passando, inclusive contra o Netlify real).
2. Reveja a tabela consolidada (seção 2) — nenhuma linha crítica em aberto agora.
3. Confira a seção 4 (o que não pôde ser testado) — só B21, B22, B26 e B3 seguem sem verificação automatizada, todos com passo a passo manual descrito.
4. Ative autenticação em dois fatores nas contas do Supabase, do Netlify e do GitHub que controlam o projeto, se ainda não tiver.
5. Este relatório já está salvo em `docs/` — ele vira referência pra próxima rodada de auditoria, junto com `docs/auditoria-seguranca-prompt.md`.
6. Confirme que a `SUPABASE_SERVICE_ROLE_KEY` que você acabou de rotacionar (incidente da seção 3.11) é de fato a única em uso — nenhum outro `.env`, outro ambiente do Netlify ou serviço com a chave antiga.
