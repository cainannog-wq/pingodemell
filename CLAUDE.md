@AGENTS.md
@docs/escopo-pingo-de-mell.md
@docs/roadmap-pingo-de-mell.md
@docs/status-pingo-de-mell.md

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
  `node scripts/banco/permissoes.mjs --com-migracao`; o verificador de
  verdade roda de novo depois que a migração for aplicada.

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
- **O futuro checkout (antecedência de 1 dia; fim de semana até quinta)
  decide no servidor e só com esse módulo**, nunca com o relógio do
  navegador da cliente.
- **Testes não dependem do relógio real nem do fuso da máquina.** A suíte
  roda em dois fusos (UTC e America/Sao_Paulo, `vitest.config.ts`); teste
  que envolve "hoje" fixa o relógio (`vi.setSystemTime`), de preferência num
  horário crítico (depois das 21h de Brasília). `RELOGIO_TESTE=<instante>
  npm run test` fixa o relógio da suíte inteira para provar isso.

## Regra de processo — homologação dos PRs de admin

Decisão fechada com o Cainan em 24/09/2026, no PR noindex-homologacao:

- **Endereço fixo:** `homologacao--pingodemell.netlify.app`, branch deploy da
  branch `homologacao` (única branch além da `main` com deploy na Netlify),
  liberado uma vez no Turnstile. Usa o mesmo banco de produção, como os
  previews: tudo que se grava lá é real. Fica fora do Google
  (`X-Robots-Tag: noindex, nofollow`, só com `CONTEXT === "branch-deploy"`,
  em `next.config.ts`).
- **A homologação está sempre com "o PR em validação" ou "igual à
  produção"**, nunca com código velho ou recusado. Para validar um PR:
  `git push --force-with-lease origin <branch-do-pr>:homologacao`. Depois do
  merge (ou se o PR for abandonado): `git push --force-with-lease origin
  origin/main:homologacao`. Isso só move a branch `homologacao`; a `main` e a
  produção não mudam. Nunca abrir PR a partir da `homologacao` nem para ela,
  e só branches nossas vão para lá (o servidor da homologação tem a chave de
  serviço).
- **Um PR por vez em homologação.**
- **O Cainan só valida depois que o Claude disser "homologação = commit X do
  PR Y"**, conferido na lista de deploys da Netlify (deploy "Branch Deploy:
  homologacao@<commit>", pronto) contra `git rev-parse origin/homologacao`.
