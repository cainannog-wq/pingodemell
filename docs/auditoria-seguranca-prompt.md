# Auditoria de segurança — Pingo de Mell

> Prompt para rodar no Claude Code (agente com acesso ao código deste repositório e capacidade de executar comando).
> Leia este documento inteiro antes de executar qualquer comando.

---

## Bloco 0 — Contexto e regras de execução

### Contexto do projeto

Pingo de Mell é um site de catálogo de bolos, doces e salgados, com carrinho sem pagamento online que fecha pedido via WhatsApp, mais um CMS onde o dono do negócio cadastra e gerencia os próprios produtos e acompanha os pedidos. Stack: Supabase (Postgres, Auth, Storage) + Next.js, hospedado no Netlify. Não há gateway de pagamento nem processamento de cartão em nenhuma etapa — está fora de escopo por decisão de produto, não por lacuna técnica.

O modelo de autenticação é simples por design: um único usuário admin, login por email e senha via Supabase Auth, sem cadastro público, sem múltiplos papéis, sem multi-tenant. O nome de exibição do painel é só rótulo dessa mesma conta única.

O ponto estrutural mais sensível do projeto é a tabela `pedidos`: ela aceita **insert público sem autenticação** — decisão deliberada, porque o pedido nasce do clique de confirmação do cliente no checkout, sem exigir login dele. Leitura e atualização dessa tabela são restritas a usuário autenticado. A tabela `produtos` tem leitura pública e escrita restrita ao admin. Ambas têm RLS ativo desde a criação. Existe upload de arquivo hoje só pelo admin autenticado (foto de produto no CRUD); upload de foto de referência de bolo pelo cliente final está **em decisão aberta**, ainda não implementado — ver Bloco E, item 6 (Condicionais).

Hoje (14/09/2026) já estão implementados e em produção/PR: login do admin com Turnstile (CAPTCHA) de produção, CRUD completo de produto (criar, editar, excluir, upload de imagem), e o painel de pedidos (histórico e detalhe, com pedidos de teste semeados manualmente porque o checkout público ainda não existe). Catálogo público, carrinho e checkout (que vai reaproveitar a tabela `pedidos` e a rota de rate limit já criadas) ainda **não foram construídos** — não fazem parte do inventário real desta rodada, mas aparecem como condicionais no relatório final porque a tabela e a política de RLS que eles vão usar já existem e já podem ser atacadas hoje, mesmo sem a tela.

Houve um incidente de segurança registrado em 11/09/2026: três credenciais (service_role key do Supabase, secret key de produção do Turnstile, senha do admin de teste) apareceram em texto puro no histórico de conversa via `cat .env.local`. As três foram rotacionadas, e já foi confirmado via `git log --all -- .env.local` que o arquivo nunca foi commitado e que `.gitignore` cobre `.env*`. Esta auditoria deve reverificar esse fechamento, não assumir que está resolvido só porque está documentado.

### Nota de prioridade

Como a tabela `pedidos` aceita escrita pública sem autenticação, os itens **B12 (mass assignment)**, **B13 (manipulação de regra de negócio no cliente)** e **B6 (exaustão de recurso)** são a prioridade máxima desta auditoria — a única barreira entre qualquer pessoa na internet e a tabela de pedidos é a regra de validação daquele endpoint específico e o rate limit por IP. Em segundo lugar, **B9 (vazamento de segredo)** ganha peso extra por causa do incidente de 11/09/2026, que precisa de reverificação, não só de confiança no que já foi registrado.

### Regras obrigatórias durante toda a auditoria

1. Nunca imprimir valor de variável de ambiente ou segredo (nunca `cat`, `echo $VAR` ou equivalente num arquivo ou variável que contenha chave/senha/token). Para confirmar existência de uma variável, teste a presença sem revelar o valor (ex.: checar se a chamada que depende dela funciona, ou se o processo falha por variável ausente).
2. Não desativar RLS, regra de validação ou qualquer controle de segurança "só para testar". Se um teste exige contornar proteção, use registro descartável criado só para esse fim (prefixo identificável, ex. `AUDIT_TEST_`) e remova depois, registrando no relatório o que foi criado e removido.
3. Nenhum item marcado como resolvido sem teste automatizado que comprove: escrever o teste que reproduz a falha, mostrar ele falhando, aplicar a correção, mostrar ele passando.
4. Nenhuma conclusão em prosa sem evidência bruta colada junto — comando rodado, saída, código de status HTTP.
5. Não rodar teste destrutivo contra dado real; usar dado de teste identificável por prefixo (`AUDIT_TEST_`) e limpar ao final.
6. Não commitar nada sem avisar antes o que e por quê.
7. Se um item não puder ser testado por depender de painel externo (Netlify, Supabase, Turnstile) ou ação manual, diga isso explicitamente e escreva o passo a passo da verificação manual — nunca assuma que está certo por padrão.
8. Você está auditando código que você mesmo (ou uma sessão anterior do Claude Code) pode ter escrito. Trate isso como conflito de interesse declarado e procure ativamente o argumento contra a própria implementação.

---

## Bloco A — Inventário e histórico

### O que já foi testado antes

Preencha esta tabela lendo `docs/roadmap-pingo-de-mell.md` e `docs/status-pingo-de-mell.md` antes de rodar qualquer coisa nova — não repita teste já coberto sem necessidade, mas **não aceite o resultado antigo sem reconferir o que a coluna "cobre fluxo real" pede**.

| Item | Já testado? | Quando | Como | Evidência | Cobre fluxo real ou só camada isolada |
|---|---|---|---|---|---|
| RLS `produtos` (leitura pública, escrita só autenticado) | Sim | Fase 0 (antes de 11/09/2026) | Teste automatizado tentando ler/inserir/apagar produto sem login | Suíte de teste do projeto — localizar arquivo exato em `scripts/` ou `tests/` | Camada isolada (via cliente anônimo direto, não pela tela) |
| RLS `pedidos` (insert público, leitura/update só autenticado) | Sim | 11/09/2026 | `scripts/test-rls-pedidos.mjs` | 7/7 testes passando, registrado em `docs/status-pingo-de-mell.md` | Camada isolada (checkout ainda não existe, teste foi direto no Supabase) |
| Rate limit por IP — insert de pedido | Sim | 11/09/2026 | `scripts/test-rate-limit-pedidos.mjs` | Bloqueio confirmado na 6ª tentativa | Camada isolada |
| Rate limit por IP — login admin (Turnstile) | Sim | 11/09/2026 | Testado isolado com secret key de sandbox do Turnstile, 30 req/5min configurado | Bloqueio real em 32 e 40 tentativas em duas rodadas separadas, `error_code=over_request_rate_limit` | Camada isolada, sem passar pelo CAPTCHA de produção |
| CAPTCHA (Turnstile) — validação server-side sem token | Sim | 11/09/2026 | Testes de força bruta sem `captcha_token` | 100% `captcha_failed` nos primeiros testes | Camada isolada |
| CAPTCHA (Turnstile) — widget visual de produção na tela real | Sim | 11/09/2026 | Verificação visual na tela de login real, site key/secret key de produção (não sandbox) | Confirmado por Cainan, registrado em `docs/status-pingo-de-mell.md` | Fluxo real |
| Vazamento de credencial (`.env.local` via `cat`) | Sim (incidente + correção) | 11/09/2026 | `git log --all -- .env.local` | Confirmado: arquivo nunca commitado; `.gitignore` cobre `.env*`; três credenciais rotacionadas | Fluxo real (histórico real do repositório) |
| Exclusão de produto (D do CRUD) | Sim | 11/09/2026 | Confirmado funcionando rodando o app local | Registrado em `docs/status-pingo-de-mell.md` | Fluxo real, mas testado como admin legítimo, não como tentativa de acesso indevido |

O que **não** está nessa tabela ainda precisa de teste nesta rodada — trate ausência de linha como "nunca testado", não como "não se aplica".

### Inventário da superfície de ataque

Monte esta lista lendo o código real do repositório, não assuma a partir deste documento:

- Todas as rotas em `src/app/` — públicas e restritas a admin (`/admin/*`, `/login`, rotas de API/Route Handlers como `/api/pedidos`)
- Todas as tabelas do Supabase (mínimo conhecido: `produtos`, `pedidos`) com o texto completo de cada política de RLS, comando por comando (select, insert, update, delete)
- Toda política de bucket de Storage (upload de foto de produto): público ou privado, quem pode escrever, limite de tamanho e tipo aceito
- Nome de toda variável de ambiente usada no projeto (sem valor) — separe as que são públicas (prefixo `NEXT_PUBLIC_` ou equivalente) das privadas, e justifique cada variável pública
- Todas as dependências diretas do `package.json` com versão instalada
- Se o Netlify já está conectado ao repositório (verificar status atual — na última atualização de `docs/status-pingo-de-mell.md` ainda não estava) e, se estiver, se já existe URL de preview pública ativa

---

## Bloco B — Auditoria item a item

Ordem: itens de prioridade máxima primeiro (B12, B13, B6, B9), depois o resto do núcleo B1–B20 na ordem original, depois os extras B21–B26.

Para cada item: (1) Verificação — onde no projeto o vetor se aplica, com caminho de arquivo; (2) Status anterior — já testado? evidência?; (3) Teste executado agora — comando, saída, veredito; (4) Achado — seguro, vulnerável ou não verificável, com justificativa.

### Itens de prioridade máxima

#### B12. Mass assignment (prioridade máxima)

**Mecanismo.** A rota de insert público em `pedidos` aceita qualquer campo que o cliente enviar, sem lista explícita do permitido. O atacante inclui no corpo da requisição um campo de controle que a tela nunca mostra.

**Como o atacante pensa.** Observa a estrutura da requisição que o formulário de checkout enviaria (ou, hoje, a estrutura esperada pela RLS/schema), e monta a requisição à mão acrescentando campo como `status`, `id`, `criado_em`, ou qualquer coluna que devia ser calculada pelo servidor.

**O que verificar.** Se a política de insert de `pedidos` (e a validação de schema, se houver camada de validação antes do banco) restringe explicitamente quais colunas o cliente anônimo pode preencher. Se `status` do pedido tem valor padrão protegido contra sobrescrita pelo cliente (deve nascer sempre como "aguardando confirmação", nunca aceito da requisição).

**Como provar.** Envie um insert direto (via cliente Supabase anônimo ou REST) para `pedidos` incluindo campo `status` com valor diferente do padrão (ex. "entregue") e mostre o que foi de fato gravado. Repita tentando setar um `id` ou campo de auditoria arbitrário.

#### B13. Manipulação de regra de negócio no cliente (prioridade máxima)

**Mecanismo.** Regras como pedido mínimo por produto e antecedência mínima de entrega (1 dia em dia de semana, até quinta para fim de semana, sem entrega em segunda) existem hoje só como regra de negócio documentada — quando o checkout for implementado, se essa validação só existir na tela, qualquer requisição direta ignora.

**Como o atacante pensa.** Ignora o formulário e envia insert direto em `pedidos` com quantidade abaixo do mínimo do produto ou com data de entrega fora da janela permitida.

**O que verificar.** Hoje: se existe alguma validação de conteúdo na camada de RLS/banco para `pedidos` além de "quem pode inserir" (constraint de banco, trigger, ou Route Handler intermediário). Quando o checkout for codificado: se pedido mínimo e antecedência mínima são recalculados/validados no servidor, não só na tela.

**Como provar.** Envie insert direto em `pedidos` com valores que violariam as regras de negócio (se já houver algum campo relacionado no schema hoje) e mostre se é aceito ou rejeitado. Documente explicitamente que esse item precisa ser **retestado por completo** assim que o checkout existir — não é possível provar hoje mais do que a camada de banco permite.

#### B6. DDoS e exaustão de recurso (prioridade máxima)

**Mecanismo.** A rota de escrita mais exposta do projeto é o insert público de pedido. Mesmo com rate limit por IP já implementado, vale confirmar que ele está ativo em produção (não só localmente) e que não é contornável.

**O que verificar.** Se o rate limit lê o IP de um cabeçalho que o próprio cliente pode forjar (`X-Forwarded-For` sem validação de proxy confiável é contornável). Se o limite vale por IP e não só globalmente. Proteção de rede do Netlify ativa (confirmar, não assumir).

**Como provar.** Repita o teste de `scripts/test-rate-limit-pedidos.mjs` contra o ambiente **publicado**, não só local. Tente contornar enviando `X-Forwarded-For` forjado com IPs diferentes a cada requisição e veja se o bloqueio ainda ocorre.

#### B9. Vazamento de segredo e configuração exposta (prioridade elevada por incidente anterior)

Ver item B24 (fechamento de incidente anterior) para a verificação específica do incidente de 11/09/2026. Além disso, aplique o texto padrão do núcleo:

**O que verificar.** Varredura do histórico completo do Git (não só do estado atual) por padrão de segredo. Nenhum segredo com privilégio elevado (`SUPABASE_SERVICE_ROLE_KEY`, secret key do Turnstile) presente no pacote publicado ao navegador. Nenhum arquivo de configuração ou backup acessível por URL direta no Netlify.

**Como provar.** Rode uma varredura de histórico (ex. `git log -p | grep` por padrão de chave, sem imprimir o valor encontrado — só arquivo, commit e tipo) e cole o resultado. Liste as variáveis `NEXT_PUBLIC_*` usadas e justifique cada uma.

---

### Núcleo fixo — restante (B1 a B20, exceto os já tratados acima)

Para os itens abaixo, adapte o texto de `core-vectors.md` ao projeto: tabelas reais são `produtos` e `pedidos`; rotas reais estão sob `/admin/*`, `/login`, `/api/pedidos`; autenticação é Supabase Auth com usuário único; hospedagem é Netlify.

- **B1. SQL Injection** — como o acesso a dado passa pelo cliente Supabase (que parametriza por construção), o risco concentra em qualquer SQL bruto ou função com privilégio elevado (`SECURITY DEFINER`) que o projeto tenha criado. Verifique se existe alguma função assim e se o `search_path` dela é fixado explicitamente (ver também B25).
- **B2. XSS** — verifique todo ponto que renderize texto vindo de `pedidos` ou `produtos` (nome, observações, descrição) na tela do admin. Campo de observação do pedido é o candidato mais provável por ser texto livre gravado por qualquer visitante anônimo e lido depois pelo admin.
- **B3. Quebra de autenticação e de sessão** — teste expiração da sessão do Supabase Auth, se logout invalida no servidor, se sessão sobrevive à troca de senha do admin.
- **B4. Broken Access Control e IDOR** — sem sessão de admin, tente ler, criar, atualizar e apagar `produtos` e `pedidos` usando só a chave anônima. Tente abrir cada rota `/admin/*` por URL direta sem login.
- **B5. Credential stuffing e força bruta** — cobre login do admin; já parcialmente testado (ver Bloco A), reconferir se mensagem de erro é idêntica para email inexistente e senha errada.
- **B7. CSRF** — verifique como a sessão do admin é transportada nas rotas de mutação do CRUD e do painel de pedidos.
- **B8. SSRF** — busque campo que aceite URL fornecida pelo usuário (ex. link de foto por URL em vez de upload direto). Se não existir, declare inaplicável com a busca que confirma isso.
- **B10. Ataque de cadeia de suprimento** — rode auditoria de dependência do `package.json`/lockfile.
- **B11. Regras de autorização da camada de dados ausentes ou incompletas** — liste toda tabela do Supabase (não só `produtos` e `pedidos` — confirme se não existe nenhuma outra tabela esquecida sem RLS) com o texto completo de cada política.
- **B14. Validação apenas no frontend** — para cada campo obrigatório do CRUD de produto e do futuro checkout, confirme validação equivalente no servidor/banco.
- **B15. Upload de arquivo sem restrição (prioridade elevada)** — hoje só admin autenticado sobe foto de produto, mas ainda vale verificar tipo real do arquivo (não só extensão), limite de tamanho no servidor, e política do bucket de Storage (público vs. privado). Elevado a prioridade alta porque upload existe e a decisão de abrir upload para cliente final (foto de referência do bolo) está em aberto — ver Bloco E, item 6.
- **B16. CORS permissivo** — verifique configuração de CORS em `/api/pedidos` e em qualquer outra rota de API.
- **B17. Mensagem de erro que vaza detalhe interno** — provoque erro em pelo menos cinco pontos (login errado, insert de pedido malformado, upload inválido, rota inexistente, campo obrigatório faltando) e confirme que nenhum expõe stack trace, nome de tabela ou coluna.
- **B18. Teste que cobre só o caminho feliz** — classifique cada teste existente (`scripts/test-rls-pedidos.mjs`, `scripts/test-rate-limit-pedidos.mjs`, teste de RLS de produto) em caminho feliz vs. caminho de ataque, e liste o que falta.
- **B19. Dependência desatualizada com vulnerabilidade conhecida** — mesma auditoria do B10, com foco em quem atualiza depois da entrega.
- **B20. Cabeçalhos de segurança ausentes** — colete os cabeçalhos de resposta do ambiente publicado no Netlify (não local).

---

### Extras — B21 a B26

#### B21. Dado sensível em log

**Mecanismo.** Nome, WhatsApp, email e endereço do cliente aparecem em `pedidos` — se algum desses campos vazar para log de erro, log de função do Netlify, ou ferramenta de monitoramento, a retenção e o acesso a esse log costumam ser mais amplos que o banco principal.

**O que verificar.** Se algum desses campos aparece em log de erro do Route Handler que grava o pedido, em log de build do Netlify, ou em qualquer log de função.

**Como provar.** Force um erro no fluxo de gravação de pedido (ex. campo obrigatório faltando) e confira o que aparece nos logs do Netlify — cole o trecho relevante sem incluir dado real de cliente, só a estrutura.

#### B22. Backup cobrindo dado sensível e restauração testada

**O que verificar.** Se existe backup automatizado das tabelas `produtos` e `pedidos` no Supabase, qual a janela de retenção, se já houve teste de restauração.

**Como provar.** Documentar (via painel do Supabase, sem imprimir dado) a configuração de backup ativa e se há registro de teste de restauração. Se não houver, declarar como item aberto, não como resolvido.

#### B23. Exposição de ambiente de preview (Netlify)

**Mecanismo.** Quando o Netlify for conectado ao repositório (pendência registrada em `docs/status-pingo-de-mell.md`), cada PR passa a ganhar uma URL de preview pública automaticamente.

**O que verificar.** Se o preview aponta para o mesmo banco de produção (risco de dado real exposto num ambiente sem o mesmo escrutínio) ou para uma base separada. Se as URLs de preview são bloqueadas de indexação por buscador.

**Como provar.** Assim que o Netlify estiver conectado, liste as URLs de preview ativas e tente acessá-las sem autenticação. Até lá, declare este item como **não verificável agora** e registre o passo a passo para quando a conexão existir.

#### B24. Fechamento do incidente anterior (vazamento de `.env.local`, 11/09/2026)

**O que verificar.** Confirmar de novo (não só confiar no registro em `docs/status-pingo-de-mell.md`) que a service_role key do Supabase, a secret key de produção do Turnstile e a senha do admin de teste envolvidas no incidente foram de fato rotacionadas e não continuam em uso em nenhum outro lugar do sistema (outro `.env`, outro ambiente do Netlify, outro serviço). Confirmar de novo que `.env.local` nunca foi commitado (rodar `git log --all -- .env.local` de novo, não copiar o resultado antigo). Confirmar que o hábito que causou a exposição (`cat` direto em arquivo de variável de ambiente) não se repetiu em nenhum momento desde então — buscar no histórico de comandos do projeto, se houver.

**Como provar.** Cole a saída atualizada de `git log --all -- .env.local`. Confirme (sem imprimir valor) que as chaves atuais em uso são diferentes das que apareceram no incidente.

#### B25. Auditoria de política linha a linha (RLS Supabase/Postgres)

**Mecanismo.** A proteção é configurada tabela por tabela e comando por comando; uma tabela nova (como `pedidos`, criada depois de `produtos`) é o ponto mais comum de esquecimento de alguma regra.

**O que verificar.** Se existe alguma função com `SECURITY DEFINER` no projeto e se o `search_path` dela é fixado explicitamente. Se a service_role key aparece em qualquer arquivo enviado ao navegador (bundle do Next.js). Se alguma view no Supabase não herda a proteção da tabela de origem. Se a regra de insert de `pedidos` valida conteúdo além de "é anônimo, pode inserir" (conecta direto com B12).

**Como provar.** Liste as políticas de RLS de `produtos` e `pedidos` na íntegra (texto completo de cada uma). Busque no bundle de produção publicado por qualquer string que pareça a service_role key.

#### B26. Injeção de conteúdo no destino do dado (mensagem do WhatsApp) — condicional

**Mecanismo.** Quando o checkout existir, o campo de observação ou nome do pedido vai alimentar a mensagem formatada que abre o WhatsApp. Texto livre de um formulário público, sem tratamento, pode quebrar a formatação da mensagem ou incluir link indesejado.

**Status.** Não aplicável ainda — a montagem da mensagem do WhatsApp não está implementada (ver Bloco E, item 6). Registrado aqui para não ser esquecido quando o checkout for codificado.

**O que verificar quando existir.** Codificação de cada campo antes de compor a mensagem, comportamento com caractere especial e quebra de linha em excesso, limite de tamanho do campo de observação.

---

## Bloco C — Testes adicionais sempre relevantes

- **Diferença entre ambiente local e publicado**: repita os testes de maior risco (rate limit, RLS, cabeçalhos de segurança) contra a URL publicada no Netlify, não só localmente — resultado local não prova o ambiente real.
- **Integridade do dado no nível do banco**: confirme constraint de banco em `produtos` (preço não negativo, quantidade mínima não nula) e em `pedidos` (status só aceita valor de lista fechada) — essa é a última linha de defesa mesmo se a aplicação mudar.
- **Segurança da conta que administra a infraestrutura**: verifique autenticação em dois fatores nas contas Supabase, Netlify e GitHub que controlam o projeto, quem tem acesso a cada uma, e se existe token de acesso antigo ainda válido.
- **Consentimento de cookie/tag de rastreamento**: ainda não implementado neste projeto (Fase 4 do roadmap — GA4, Clarity, banner LGPD). Não aplicável nesta rodada; registre como pendência futura, não como falha atual.

---

## Bloco D — Correção e reteste

Para cada achado vulnerável: classifique gravidade (crítico, alto, médio, baixo) considerando probabilidade e impacto real neste projeto — por exemplo, mass assignment em `pedidos` sem consequência financeira direta (não há pagamento) tem impacto diferente do que teria num sistema com cobrança, mas ainda pode falsificar status de pedido e histórico do painel, o que é real.

Escreva o teste que reproduz a falha, mostre falhando, aplique a correção, mostre passando, rode a suíte inteira para confirmar que nada quebrou, e registre o teste na suíte permanente do projeto.

Ordem: crítico, depois alto, depois médio. Baixo pode ser aceito como risco com justificativa escrita. Repita o ciclo até todo crítico e alto estar com teste passando.

Se um item depender de decisão de negócio (ex. B26, condicional ao checkout existir) ou de ação manual fora do alcance do agente (ex. B22, backup, ou B23, preview do Netlify antes de conectado), não force solução técnica — pare, explique a decisão necessária, deixe aberto no relatório com o nome de quem precisa decidir (Cainan, para decisão de produto/negócio; ação fora do Claude Code para configuração de painel externo).

---

## Bloco E — Relatório final

1. **Resumo executivo** — quantos itens verificados, quantos seguros, quantos vulneráveis, quantos corrigidos, quantos abertos. Linguagem simples, no máximo dez linhas.
2. **Tabela consolidada** — item × status anterior × achado × gravidade × corrigido? × evidência × teste na suíte.
3. **Detalhamento por item corrigido** — a falha, o que um atacante conseguiria fazer explorando ela, o que foi alterado, qual teste garante que não volta.
4. **O que não pôde ser testado** — específico e honesto. Itens esperados aqui, salvo confirmação em contrário durante a execução: B22 (backup — depende do painel do Supabase), B23 (preview do Netlify — depende da conexão ainda pendente), B26 (mensagem do WhatsApp — depende do checkout ainda não implementado).
5. **Riscos aceitos** — o que ficou sem correção de propósito, com justificativa.
6. **Condicionais** — itens seguros hoje que viram críticos se uma decisão pendente for tomada num certo sentido. Usar explicitamente as duas decisões em aberto do projeto:
   - **Foto de referência do bolo personalizado**: se a decisão for por upload no site (ainda não fechada com a cliente, ver `docs/escopo-pingo-de-mell.md`), B15 (upload sem restrição) sobe para crítico, porque passaria a aceitar upload de usuário anônimo, e ganha o item extra de "abuso de armazenamento por upload anônimo" que hoje não se aplica.
   - **Checkout público (Fase 2, item 4)**: quando implementado, B13 e B26 precisam de reteste completo com o formulário real, porque hoje só foram testados na camada de RLS/banco, sem passar pela validação de tela nem pela montagem da mensagem do WhatsApp.
7. **Manutenção contínua** — o que precisa ser reverificado depois da entrega, com que frequência, por quem (ex.: auditoria de dependência a cada trimestre; reteste de RLS toda vez que uma tabela nova for criada).
8. **Limites desta auditoria** — declare explicitamente que cobre vetores conhecidos com as ferramentas disponíveis, e não equivale a teste de invasão profissional independente. Nunca afirme que o sistema está livre de vulnerabilidade.

---

## Checklist manual para o dono do projeto

Cainan não lê código e valida por resultado visível (tela, link, teste rodando). Calibre esta lista para isso — sem jargão técnico, um passo por linha, com o resultado esperado:

1. Peça pro Claude Code te mostrar a tabela consolidada do relatório final (Bloco E, item 2) — se tiver linha vermelha (vulnerável, não corrigido), pergunte por que antes de aprovar.
2. Confira se a seção "O que não pôde ser testado" (Bloco E, item 4) tem passo a passo manual pra cada item — se não tiver, peça pra completar antes de considerar a auditoria fechada.
3. Pra cada credencial mencionada no incidente de 11/09/2026 (chave do Supabase, chave do Turnstile, senha do admin de teste), confirme que ainda são as versões trocadas depois do incidente, não as antigas.
4. Ative autenticação em dois fatores nas contas do Supabase, do Netlify e do GitHub que controlam o projeto, se ainda não tiver.
5. Guarde este relatório junto dos outros documentos do projeto (`docs/`) — ele vira referência pra próxima rodada de auditoria.
