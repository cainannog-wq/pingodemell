@AGENTS.md
@docs/status-pingo-de-mell.md

Este arquivo guarda só regras técnicas (schema, RLS, rotas, scripts, testes,
fluxo de PR e de homologação). Escopo, roadmap e regras de negócio ficam
fora do repositório e chegam no prompt de cada PR; não copiar para cá nem
para `docs/`. Decisão do Cainan em 28/09/2026, no PR 2d.

## Regra de processo — migração de schema x merge do PR

Decisão fechada com o Cainan em 22/09/2026, valendo a partir do PR do catálogo
público em diante:

- **Pode aplicar em produção antes do merge do PR**: migração puramente
  aditiva — criar tabela nova, ou criar coluna nova opcional (aceita nulo ou
  tem valor padrão), sem alterar nada que já existe.
- **Não pode aplicar antes do merge, precisa esperar o PR ser mergeado na
  main**: qualquer migração que altere o tipo de uma coluna existente, apague
  ou renomeie algo, adicione restrição obrigatória (NOT NULL sem default) em
  cima de tabela que já tem linhas, ou mude política de acesso (RLS) de uma
  tabela que já está em uso.

Isso vale para qualquer migração aplicada via MCP do Supabase (ou qualquer
outro caminho) neste projeto, não só para um PR específico.

Migração não aditiva só vai a produção depois do merge, com ok explícito de Cainan; todo teste de banco que simula o estado antigo deve pular sozinho quando a migração já está aplicada, e teste que só omite a coluna deve passar um valor válido.

Todo PR que traga migração de schema informa na descrição do PR qual das duas
categorias acima ela é (aditiva ou não-aditiva) e se ela já foi aplicada em
produção antes do merge ou se só será aplicada depois.

Todo PR que traga migração de schema também atualiza, no mesmo PR, o
`docs/status-pingo-de-mell.md` (estado técnico): a linha da migração na
tabela de migrações aplicadas (arquivo, registro no Supabase, data e
categoria) e, se mudou, as políticas de RLS, funções, rotas e scripts de
teste listados lá.

## Regras de segurança do banco e dos testes

Decisão fechada com o Cainan em 24/09/2026, no PR seguranca-api:

- **Nenhum script de teste grava em produção.** O banco é um só (produção,
  previews e scripts locais). Teste de banco roda numa transação desfeita
  no fim (`scripts/banco/`, base em `scripts/banco/lib.mjs`), e teste HTTP
  só faz chamadas que nunca gravam (`scripts/banco/http-sem-gravar.mjs`).
  Um insert que chega a rodar gasta número de pedido mesmo desfeito: teste
  de gravação de pedido usa uma cópia da tabela criada dentro da transação.
  O que não dá para provar sem gravar vira checagem manual, só com o ok do
  Cainan, documentada no `docs/status-pingo-de-mell.md`. Os scripts de
  carga (`seed-*.mjs`, `create-test-admin.mjs`) gravam por definição e não
  são teste.
- **Toda função nova nasce sem permissão de execução para o anônimo.** O
  padrão do Postgres/Supabase dá EXECUTE a PUBLIC, anon e authenticated em
  toda função nova (o `revoke ... from public` sozinho não tira o de anon e
  authenticated). Desde `supabase/seguranca-api.sql` o padrão do papel
  postgres já nasce fechado, mas toda migração que cria função escreve o
  `revoke execute ... from public, anon, authenticated` e o `grant`
  explícito de quem precisa. Liberar para anon ou authenticated só com
  justificativa no PR. O mesmo vale para tabela nova: o padrão dá todas as
  permissões a anon e authenticated e deixa a proteção só na RLS — a
  migração tira o que o papel não precisa (TRUNCATE sempre, porque ignora
  a RLS). `scripts/banco/permissoes.mjs` falha se aparecer tabela ou função
  sem o esperado registrado nele.
- **Todo PR com migração roda o verificador de segurança do Supabase
  (security advisors) e mostra a saída na descrição do PR**, antes e depois
  da migração, com uma justificativa para cada alerta que continuar. Antes
  do merge, o "depois" das regras de banco sai de
  `node scripts/banco/permissoes.mjs --com-migracao=<arquivo.sql>`; o
  verificador de verdade roda de novo depois que a migração for aplicada.
- **Ensaio avulso contra produção com ALTER ou REVOKE usa uma conexão só,
  com `lock_timeout` e `statement_timeout` curtos na própria sessão.** Nunca
  abra uma segunda conexão lendo a mesma tabela dentro de uma transação que
  a altera (a bateria do repositório já faz isso em `scripts/banco/lib.mjs`).
  A aplicação real é segura: o `lock_timeout` de 2 segundos cancela a
  migração se a tabela estiver ocupada. Motivo: em 03/10/2026 um script
  avulso abriu uma segunda conexão lendo `produtos` enquanto a primeira
  segurava o ALTER, e a tabela ficou 2 minutos travada.

## Regra do slug do produto (URL amigável)

Decisão fechada com o Cainan em 28/09/2026, no PR slug:

- **O slug é gerado e travado no banco** (`supabase/produtos-slug.sql`): um
  gatilho gera o slug a partir do nome no cadastro, e outro recusa qualquer
  mudança num slug já preenchido. Renomear o produto não mexe no slug.
- **Código e scripts nunca enviam slug**: gravam sem ele e leem o valor
  depois. O banco aceita um slug enviado (no formato e sem repetir) só para
  o único uso legítimo: restaurar backup com as URLs originais.
- **A leitura do produto pelo slug fica no código do site**
  (`buscarProdutoPorSlug`, em `src/lib/vitrine/buscar.ts`, só ativo, com o
  filtro na consulta). Não criar função de banco pública para isso.
- Consequências aceitas: produto recadastrado com o nome de um produto
  desativado ganha `-2` na URL, para sempre; produto excluído libera o slug,
  e o endereço antigo passa a abrir o produto novo (por isso: desativar,
  nunca excluir). Detalhes em `docs/status-pingo-de-mell.md`.
- **Todo PR que mexe em gatilho ou função de `produtos` roda
  `node scripts/banco/rodar-todos.mjs` antes do merge** (com
  `--com-migracao=<arquivo.sql>` se a mudança ainda não estiver aplicada) e
  mostra a saída no PR, inclusive o resumo de testes pulados. A etapa 2 do
  slug (aplicada em 02/10/2026) tirou do gatilho de edição o ramo que
  dependia da ordem dos gatilhos; o teste `slug 13` em
  `scripts/banco/slug.mjs` continua conferindo a ordem, só como registro, e
  ela só volta a importar se `supabase/produtos-slug-obrigatorio-desfazer.sql`
  for aplicado.

## Regra de fuso horário — "que dia é"

Decisão fechada com o Cainan em 24/09/2026, no PR fuso-brasilia:

- **Só `src/lib/tempo/brasilia.ts` decide "que dia é" ou "que dia da semana
  é"**, sempre no fuso da loja (`America/Sao_Paulo`, explícito via Intl).
  Fora dele, nenhum `new Date()`, `getDay()`, `getDate()`, `getMonth()`,
  `getFullYear()`, `toISOString().slice(0, 10)`, `toLocaleDateString` ou
  equivalente decide o dia. O servidor (Netlify) e o banco (Supabase) rodam
  em UTC: entre 21h e meia-noite de Brasília, para eles já é o dia seguinte.
  Comparar dois instantes (`getTime()`, "já passou do horário de entrega?")
  não decide dia e pode ficar fora do módulo.
- **O futuro checkout decide a antecedência da data no servidor e só com
  esse módulo**, nunca com o relógio do navegador da cliente (a regra de
  antecedência em si chega no prompt do PR do checkout).
- **Testes não dependem do relógio real nem do fuso da máquina.** A suíte
  roda em dois fusos (UTC e America/Sao_Paulo, `vitest.config.ts`); teste
  que envolve "hoje" fixa o relógio (`vi.setSystemTime`), de preferência num
  horário crítico (depois das 21h de Brasília). `RELOGIO_TESTE=<instante>
  npm run test` fixa o relógio da suíte inteira para provar isso.

## Regra do consentimento e do GA4

Decisão fechada com o Cainan em 05/10/2026, no PR 2 da Fase 4
(`fase4/pr2-banner-ga4`):

- **Todo PR que mexa em banner, consentimento ou GA4 roda
  `npm run test:consentimento`** (Playwright, fora do `npm run test`) e cola
  no PR a saída com a contagem de testes executados e pulados. Teste pulado
  não conta como passou. O script usa o Chrome instalado na máquina, o ID de
  mentira `G-TESTE00000` e intercepta o Google, o WhatsApp e qualquer
  escrita (POST `/api/pedidos`, escrita na Supabase).
- **`GA4_ID` só existe na Netlify com escopo Branch deploys até a Política
  de Privacidade v2.** O ID real nunca entra no código, num arquivo
  versionado nem num teste. A produção é protegida também no código: com o
  contexto de build `production` e `VERSAO_POLITICA` menor que 2, o ID
  efetivo é nulo (`src/lib/analitica/id.ts`); o PR da v2 destrava ao subir a
  versão.
- O teste interceptado não executa o `gtag.js` real: não prova o que ele
  envia nem que a medição aprimorada está desligada no painel do GA4. Isso
  se prova no DebugView.

## Regra de processo — homologação dos PRs de admin

Decisão fechada com o Cainan em 24/09/2026, no PR noindex-homologacao:

- **Endereço fixo:** `homologacao--pingodemell.netlify.app`, branch deploy da
  branch `homologacao` (única branch além da `main` com deploy na Netlify),
  liberado uma vez no Turnstile. Usa o mesmo banco de produção, como os
  previews: tudo que se grava lá é real. Fica fora do Google
  (`X-Robots-Tag: noindex, nofollow`, só com `CONTEXT === "branch-deploy"`,
  em `next.config.ts`).
- **A homologação está sempre com "o PR em validação" ou "igual à
  produção"**, nunca com código velho ou recusado. Para validar um PR, a
  branch `homologacao` passa para a branch do PR:
  `git push --force-with-lease origin <branch-do-pr>:homologacao`. Depois do
  merge (ou se o PR for abandonado), volta para o último commit da `main` que
  não seja do heartbeat: `git push --force-with-lease origin
  <commit>:homologacao` (commit de heartbeat só muda `heartbeat-log.txt`, o
  build seria pulado e o cabeçalho ficaria atrasado). Isso só move a branch
  `homologacao`; a `main` e a produção não mudam. Nunca abrir PR a partir da `homologacao` nem para ela,
  e só branches nossas vão para lá (o servidor da homologação tem a chave de
  serviço).
- **Um PR por vez em homologação.**
- **O Cainan só valida depois que o Claude disser "homologação = commit X do
  PR Y"**, conferido na lista de deploys da Netlify (deploy "Branch Deploy:
  homologacao@<commit>", pronto) contra `git rev-parse origin/homologacao`.
- **Deploy Previews estão desativados na Netlify.** A validação é sempre na
  homologação.
- **Prova que depende de carregamento visual (logo, imagem preguiçosa,
  captura de tela) usa a extensão Claude in Chrome ou o Chrome headless.** O
  painel de navegador embutido do app pode estar oculto e não carrega imagem
  com `loading=lazy`, o que gera falso negativo. Motivo: o logo do cabeçalho
  pareceu sumir na Home em 03/10/2026 só por isso.

## Regra de custo — créditos da Netlify

Decisão fechada com o Cainan em 25/09/2026, no PR economia-deploys;
atualizada em 28/09/2026 (troca de plano) e em 03/10/2026 (fim do fluxo da
`lote`). Plano **Personal** (pago) da Netlify desde 28/09/2026: 1.000
créditos por mês, que **renovam todo mês** e são **da conta inteira**,
divididos entre todos os sites dela. **Cada merge na `main` que muda
arquivo do site gera um deploy de produção e custa 15 créditos**; branch
deploy (homologação), build pulado e build que falha não custam (Deploy
Preview também não, mas está desativado). Se os créditos acabam, **todos os
sites da conta saem do ar** até o ciclo virar, não só o pingodemell. Saldo e
histórico em `docs/status-pingo-de-mell.md`, seção "Créditos da Netlify".

- **Só merge na `main` gera deploy pago.** Validação sempre na homologação.
- **Nunca usar "Trigger deploy" nem "Clear cache and deploy site" da página
  de Deploys** para forçar a homologação: publicam a produção (28/09/2026,
  15 créditos).
- **Commit que não deve publicar leva `[skip netlify]` na mensagem** (o
  commit do heartbeat já leva). Não usar `[skip ci]`: também pula o GitHub
  Actions.
- **Regra de ignorar build** (`netlify.toml`, `scripts/netlify/ignorar-build.mjs`):
  a Netlify pula o build quando só mudou `docs/`, `*.md`, `supabase/*.sql`,
  `scripts/`, `.github/`, `heartbeat-log.txt` ou `.gitignore`. Qualquer
  outro arquivo gera deploy. **Não remover.**

Fluxo de PR (desde 02/10/2026; a branch `lote` deixou de ser usada em
03/10/2026 e não é apagada):

1. **Todo PR nasce da `main`, numa branch própria, e é aberto contra a
   `main`.** Ninguém dá push direto na `main`, exceto o commit do heartbeat
   (`[skip netlify]`). Nenhum PR usa a `lote` como base.
2. A validação de cada PR é na homologação, pelo fluxo acima (gratuito), com
   as três regras: um PR por vez; o Claude diz "homologação = commit X do
   PR Y"; o Cainan só valida depois disso. Depois do ok, o PR é mergeado
   direto na `main` (deploy de produção, se mexer em arquivo do site) e a
   homologação volta ao último commit da `main` que não seja do heartbeat.
3. **Ruleset 24350639 da `main` (GitHub): só proíbe apagar a branch e force
   push.** Não exige PR nem revisão; a regra do item 1 é de processo.
4. Migração: aditiva pode ir para produção antes do merge do PR. Não aditiva
   só depois do merge, com ok explícito do Cainan; enquanto ela não é
   aplicada, o código na `main` precisa funcionar com o banco como está.
5. Merge só quando o Cainan pedir, ou quando ele der autonomia de merge para
   aquele PR, com as condições escritas no prompt.
6. **Créditos: o Cainan confere o saldo à mão no painel da Netlify**
   (Usage & billing). Não há piso de créditos que bloqueie push ou merge, e
   o Claude não precisa informar o saldo antes do merge.
