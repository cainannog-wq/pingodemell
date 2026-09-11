# Roadmap Pingo de Mell — Orquestração via Claude Code

Contexto assumido: Supabase (banco, storage, auth) + Netlify, 60 produtos, login email/senha sem cadastro público, RLS ativo, carrinho sem pagamento fechando via WhatsApp, você não lê código e vai validar por resultado visível (tela, link, teste passando).

Regra geral que vale pra todas as fases: nunca peça duas fases ao mesmo tempo num prompt só. Escopo pequeno é mais fácil de revisar sem ler código, porque você consegue julgar "isso funciona ou não" olhando um resultado concreto, não um diff.

## Fase 0 — Fundação técnica

Isso vem antes de qualquer tela bonita, porque é a base que sustenta tudo.

Peça ao Claude Code:
- Criar o projeto Supabase e conectar ao repositório
- Configurar Supabase Auth com email e senha, cadastro público desativado
- Criar as tabelas de produto com RLS ativado desde o início, não depois
- Escrever um teste automatizado que tenta ler, inserir e apagar produto sem estar logado, pra provar que o RLS bloqueia
- Ativar CAPTCHA (hCaptcha ou Cloudflare Turnstile) na configuração de Auth do Supabase, direto pelo painel, pra proteger o login do admin contra ataque distribuído (várias IPs tentando login ao mesmo tempo), caso que passa do limite de tentativa por IP que o Supabase já aplica por padrão
  - Observação: a criação da conta no Cloudflare Turnstile e a configuração do widget (nome, hostnames, modo Managed) são feitas manualmente por você, fora do Claude Code, antes de qualquer prompt sobre isso. Enquanto o domínio final não existe, os hostnames iniciais são localhost e o subdomínio automático do Netlify (algumacoisa.netlify.app). O domínio definitivo é adicionado a essa lista depois, sem precisar recriar as chaves.
- Confirmar que a proteção contra DDoS do Netlify e o limite de tentativa de login por IP do Supabase Auth estão ativos (ambos vêm ligados por padrão, sem configuração extra além do CAPTCHA acima)

Checkpoint pra fechar essa fase, dividido em dois blocos porque parte dele não depende de nenhuma tela existir e parte só é testável com a tela de login pronta:

- Sem depender de front: você roda o teste de RLS e vê ele passar, e confirma o resultado do teste de rate limit por IP isolado (sem CAPTCHA na frente). **Concluído em 11/09/2026** — configurado 30 req/5min no painel, bloqueio real observado em 32 e 40 tentativas em duas rodadas separadas (usando secret key de sandbox do Turnstile só pra isolar a camada de rate limit da camada de CAPTCHA), confirmado via error_code=over_request_rate_limit. A variação de 30 pro real (32 a 40) é dentro da margem normal de rate limiter distribuído, mas vale registrar que 40 é 33% acima do configurado — se esse número crescer em testes futuros, deixa de ser margem e passa a ser sinal de que o limite não está sendo aplicado com precisão.
- Dependente da tela de login existir: confirmar o CAPTCHA (Turnstile) aparecendo de verdade na tela, com site key e secret key de produção, não com token de sandbox. **Ainda em aberto em 11/09/2026.** O teste feito até agora prova que o backend bloqueia tentativa sem captcha_token (100% captcha_failed nos primeiros testes de força bruta), o que é uma evidência boa mas de camada diferente: prova que a validação server-side funciona, não que o widget do Turnstile aparece e funciona de verdade na tela real do admin com chave de produção. Agora que a tela de login isolada existe e está funcional (ver Fase 2, item 0), esse é o próximo passo natural pra fechar esse bloco: abrir a tela real, ver o widget carregar e confirmar que o login com produção passa pelo CAPTCHA.

O fechamento definitivo da Fase 0 só acontece quando os dois blocos estiverem verdes. Sem isso, nada acima é seguro, então não segue pro restante da Fase 2.

## Fase 1 — Design system

Antes de aplicar visual no site real, peça uma página isolada só com os componentes: paleta de cor, tipografia, botão, card de produto, input, estado de carrinho vazio e cheio.

Por que separado: fica muito mais fácil aprovar ou pedir ajuste numa página de amostra do que garimpar inconsistência espalhada pelo site inteiro depois.

Checkpoint: você aprova essa página de componentes antes de liberar qualquer tela funcional. **Concluído.**

## Fase 2 — Desenvolvimento, por fluxo

Contexto de stack pra essa fase: Supabase (banco, storage, auth) + Netlify.

Ordem sugerida, e o motivo de cada uma vir antes da seguinte:

0. Tela de login do admin, isolada, com Turnstile real configurado (site key e secret key de produção), sem o restante do Admin CRUD junto — essa etapa existe só pra destravar o fechamento definitivo do checkpoint da Fase 0, que depende de ver o CAPTCHA funcionando numa tela real. Antes de pedir isso ao Claude Code, vale confirmar que login, layout e rota dessa tela vão ser reaproveitados quando o CRUD completo chegar, não descartados e refeitos, senão essa antecipação vira retrabalho em vez de atalho. **Concluído em 11/09/2026** — login funcional confirmado (login realizado com sucesso). Falta ainda a checagem visual do Turnstile de produção nessa mesma tela, ver bloco dependente de tela da Fase 0 acima.
1. Admin CRUD de produto (restante, além do login) — é onde o dado nasce, sem isso não tem o que mostrar no catálogo. **Parcialmente concluído em 11/09/2026** — cadastrar e editar produto confirmados funcionando. Falta confirmar exclusão de produto (e, se ainda não validado à parte, a listagem completa do catálogo no admin) pra fechar o item por inteiro. CRUD com D faltando não é CRUD fechado, mesmo com C e U funcionando bem.
2. Catálogo público — consumindo os produtos reais cadastrados na etapa anterior
3. Carrinho — soma de itens, sem lógica de pagamento
4. Checkout e registro do pedido — formulário com dados do cliente (nome, WhatsApp, email, ocasião, modo e endereço de entrega, data e hora, forma de pagamento, observações), grava o pedido na tabela de pedidos do Supabase (RLS com insert público sem autenticação, leitura e update restritos a usuário autenticado) e, na sequência, abre o WhatsApp com a mensagem formatada. O pedido nasce do clique de confirmação no site, não da leitura da mensagem enviada. Pedir junto: teste automatizado confirmando insert anônimo funcionando e leitura/update anônimos bloqueados, mais validação de campo obrigatório e rate limit por IP no backend contra spam ou flood, sem CAPTCHA visível nessa tela
5. Painel de histórico de pedidos — listagem com busca por cliente ou número do pedido, filtro por status, cards de resumo (pedidos no mês, aguardando confirmação, entregues, valor no mês), tela de detalhe do pedido com itens, dados do cliente, entrega e pagamento, observações, linha do tempo do andamento, e as ações manuais de status (mover pra produção, marcar como entregue, cancelar pedido). Nenhum status é inferido automaticamente do WhatsApp, é sempre clique do admin. Inclui exportação da listagem filtrada em planilha (CSV ou Excel)

Peça que cada entrega venha com alguns produtos de teste já cadastrados, pra você conseguir clicar e ver funcionando sem precisar cadastrar nada manualmente antes de validar. Peça também, junto da entrega do item 4, alguns pedidos de teste já gravados no banco, pra conseguir abrir e validar o painel de histórico (item 5) sem precisar simular um pedido inteiro pelo carrinho antes.

## Correção de sequência registrada em 10/09/2026

O checkpoint original da Fase 0 pedia "confirmar o CAPTCHA aparecendo na tela de login do admin" como condição de fechamento, mas a tela de login do admin fazia parte do item 1 da Fase 2 (Admin CRUD), que só podia começar depois da Fase 0 fechada. Isso criava uma contradição direta com a regra geral do roadmap de nunca avançar fase sem fechar checkpoint da anterior: não dava pra fechar a Fase 0 sem tocar em código da Fase 2, nem pra tocar na Fase 2 sem a Fase 0 fechada.

Correção aplicada: o checkpoint da Fase 0 foi dividido em duas partes (uma sem dependência de front, outra dependente da tela de login), e a tela de login foi isolada como subitem 0 da Fase 2, adiantada na frente do resto do Admin CRUD, existindo só pra destravar a segunda parte do checkpoint da Fase 0. Fica registrado aqui pra não perder o motivo da mudança de ordem caso essa decisão seja revisitada depois.

## Incidente de segurança registrado em 11/09/2026

Durante os testes de rate limit / CAPTCHA, três credenciais apareceram em texto puro no histórico da conversa com o Claude Code via `cat .env.local`: a service_role key do Supabase, o secret key de produção do Turnstile e a senha do admin de teste. As três já foram rotacionadas. Dois pontos que ainda valem confirmação, não porque a rotação não resolva o problema imediato, mas porque um vazamento assim geralmente aponta pra um hábito de comando arriscado que pode se repetir: se o `.env.local` chegou a ser commitado no git em algum momento (mesmo que hoje as chaves estejam trocadas, isso ficaria no histórico do repositório) e se o `.gitignore` do projeto de fato cobre esse arquivo, pra não repetir a exposição. Vale também pedir ao Claude Code pra nunca mais rodar `cat` direto num arquivo de variável de ambiente — existem formas de confirmar que uma variável existe sem imprimir o valor.

**Atualização em 11/09/2026:** confirmado via `git log --all -- .env.local` que o arquivo nunca foi commitado, e o `.gitignore` já cobre `.env*`. Os dois pontos em aberto desse incidente estão fechados. Segue valendo o hábito de nunca rodar `cat` direto em arquivo de variável de ambiente.

## Acréscimo de escopo registrado em 11/09/2026 — painel de pedidos

A partir de prints das telas de histórico e detalhe de pedido, ficou decidido incluir um painel de pedidos no CMS, que antes estava listado como fora de escopo no documento de escopo. Decisões tomadas nessa conversa, que valem como referência pra qualquer prompt sobre isso:

- O pedido é gravado no Supabase no momento em que o cliente confirma o checkout no site, não a partir da leitura da mensagem real enviada pelo WhatsApp. Não existe, nesta entrega, integração com a API oficial do WhatsApp Business nem parsing automático de mensagem
- Status do pedido (aguardando confirmação, em produção, entregue, cancelado) é sempre atualizado manualmente pelo admin no painel, nunca inferido automaticamente
- O nome de exibição do painel (ex.: "Marina Alves", "Painel da equipe") é só rótulo da mesma conta única de admin já prevista no escopo, não é multiusuário nem permissão por papel
- A tabela de pedido aceita insert público sem autenticação, e a proteção contra spam ou flood é validação de campo obrigatório mais rate limit por IP no backend, sem CAPTCHA visível na tela de checkout, pra não acrescentar fricção pro cliente final
- Exportação de planilha (CSV ou Excel) da listagem de pedidos entra no escopo desta entrega, sem relatório financeiro elaborado

Esse acréscimo trouxe três telas novas (checkout, histórico de pedidos, detalhe do pedido) e uma tabela nova com regra de RLS diferente da de produto. Ainda não houve conversa sobre se isso impacta o marco do dia 45 ou o prazo final do dia 60 — ver observação correspondente no documento de escopo.

## Fase 3 — Testes

Essa é a fase que mais importa pra quem não vai ler código, porque o teste automatizado é seu substituto pra revisão de código.

Peça:
- Suíte cobrindo RLS (produto e pedido), login, CRUD de produto, cálculo do carrinho, geração da mensagem do WhatsApp, gravação do pedido no checkout, rate limit por IP na gravação de pedido
- Um checklist manual curto que você mesmo roda no navegador (cadastrar produto, ver aparecer no catálogo, montar carrinho, preencher checkout, confirmar mensagem no WhatsApp, ver o pedido aparecer no histórico do painel)

Checkpoint: todos os testes automatizados verdes antes de entrar em SEO. Se pular essa fase pra ganhar tempo, qualquer alteração futura vira aposta.

## Fase 4 — SEO e Analytics

Só faz sentido depois do site funcional, porque otimizar e instrumentar algo que ainda vai mudar de estrutura é retrabalho. As tags de Analytics entram aqui, antes do lançamento, pra já existir dado de tráfego desde o primeiro visitante real.

Peça, em pedidos separados, nunca todos juntos:
1. Meta tags e sitemap
2. Structured data de produto (schema.org) — confirmar antes se isso continua dentro do escopo, já que o documento de escopo lista schema.org como algo pra depois do lançamento
3. Banner de consentimento de cookie (LGPD), com texto claro sobre uso de dado de navegação
4. Tags do Google Analytics 4 e Microsoft Clarity, condicionadas ao consentimento do item anterior, ou seja, sem disparo antes do aceite
5. Teste automatizado provando que a tag não carrega antes do consentimento e carrega depois (verificar requisição de rede, não só aparência do banner)
6. Otimização de imagem, já que upload de cliente sem compressão pesa a página
7. Relatório de Lighthouse antes e depois das otimizações, número concreto pra você comparar

Checkpoint pra fechar essa fase: teste de consentimento passando, mostrando ausência da requisição de rede da tag antes do aceite e presença dela depois, mais o relatório de Lighthouse comparando antes/depois.

## Domínio próprio — ação fora do Claude Code

Registro e configuração do domínio definitivo são ação sua, fora do Claude Code, e precisam ser decididos com antecedência, não deixados pra última semana do prazo de 60 dias, por causa do tempo de propagação de DNS (pode levar de algumas horas a até 48 horas dependendo do registrador e do TTL configurado). Antecipar essa decisão também destrava o ajuste do Cloudflare Turnstile citado na Fase 0, que já pode receber o domínio definitivo na lista de hostnames assim que ele existir.

## Fase 5 — Lançamento e handoff

- Documentação de uso do admin em prints, não em termos técnicos
- Backup dos dados dos 60 produtos que você vai cadastrar na carga inicial
- Deixar claro que reset de senha, se o cliente esquecer, é manual por você via painel do Supabase
- Verificação de domínio no Google Search Console e envio do sitemap (ação manual sua ou do cliente, feita fora do Claude Code, com a conta Google do próprio negócio)
- Configuração do relatório Looker Studio ligado à propriedade GA4 e embutido numa tela nova do CMS, acesso restrito ao usuário admin logado

## Como você audita cada entrega sem ler código

Peça sempre um destes três: link de staging pra clicar, resultado de teste rodando na sua frente, ou print de antes/depois. Se a resposta do Claude Code for só "feito, deve funcionar", sem nenhuma prova visível, você pede pra rodar de novo até aparecer alguma dessas três coisas.
