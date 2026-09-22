# Status do roadmap — Pingo de Mell

Checklist interativo publicado como artifact, com checkbox que salva sozinho:
https://claude.ai/code/artifact/2041696a-3791-44c5-9bfd-b1e16c20cc6d

Esse artifact é a fonte viva do progresso. Este arquivo aqui é só um retrato do momento em que foi criado ou atualizado, pra qualquer sessão futura entender o contexto sem precisar reperguntar tudo. Sempre que for reportar status, abra o artifact acima em vez de confiar só neste resumo.

## Retrato em 11/09/2026 (atualizado)

Fase 0, bloco sem depender de tela: concluído. RLS, teste de RLS, Auth, Turnstile configurado e agora também o teste de rate limit por IP isolado, com resultado registrado no roadmap (configurado 30/5min, bloqueio real em 32 e 40 tentativas nas duas rodadas).

Fase 0, bloco dependente de tela: **concluído em 11/09/2026.** Cainan confirmou a checagem visual do Turnstile de produção na tela real de login (site key e secret key de produção, não sandbox). Os dois blocos da Fase 0 estão fechados.

Fase 1 (design system): concluída.

Fase 2: iniciada. Item 0 (tela de login isolada) concluído — login funcional confirmado. Item 1 (Admin CRUD) **concluído em 11/09/2026** — cadastrar, editar e agora também excluir produto confirmados funcionando. Catálogo, carrinho e integração WhatsApp ainda não iniciados. Painel de pedidos (histórico e detalhe), item 5, **em andamento** — ver seção "Acréscimo de escopo" abaixo sobre a decisão de adiantar esse item na fila.

Fase 3 a 5: não iniciadas.

Ação paralela, fora do Claude Code: domínio definitivo (registro, DNS, depois adicionar aos hostnames do Turnstile). Ainda pendente.

Schema.org (structured data de produto), confirmado fora do escopo desta entrega, fica marcado como opcional no checklist, fora de escopo.

## Incidente de segurança registrado em 11/09/2026

Durante os testes de segurança, três credenciais apareceram em texto puro no histórico da conversa com o Claude Code via `cat .env.local`: service_role key do Supabase, secret key de produção do Turnstile e senha do admin de teste. As três já foram rotacionadas. Confirmado em 11/09/2026 via `git log --all -- .env.local`: o arquivo nunca foi commitado, e o `.gitignore` já cobre `.env*`. Incidente fechado, resta o hábito de nunca rodar `cat` direto em arquivo de variável de ambiente nos próximos pedidos ao Claude Code.

## Correção de registro em 11/09/2026

O retrato anterior deste arquivo (10/09/2026) e a narrativa que vinha sendo repetida diziam que a tela de login do admin (Fase 2, item 0) já estava concluída, e que o CAPTCHA Turnstile de produção já tinha sido confirmado nela, com site key e secret key reais. Isso estava errado: nem a tela de login foi construída, nem o teste do CAPTCHA em tela real foi feito. O artifact do checklist (fonte viva) já refletia esse estado corretamente, com os itens f2-0 e f0-6 desmarcados. Só o resumo escrito aqui estava desatualizado ou incorreto. Consequência prática registrada na época: o checkpoint dependente de tela da Fase 0 seguia em aberto, e a Fase 2 ainda não tinha nenhum item concluído. Hoje, mais tarde no mesmo dia, a tela de login foi de fato construída e o CRUD parcialmente também, então parte dessa pendência já avançou — mas o teste visual do CAPTCHA de produção, especificamente, segue em aberto como estava.

## Contexto de negócio registrado em 10 e 11/09/2026

Confirmado em 10/09: só as telas do front público (catálogo, carrinho, confirmação de pedido) estavam desenhadas no Claude Design, aguardando reunião de validação com a cliente.

Atualizado em 11/09: agora também existe layout desenhado no Claude Design pra tela de login e pro restante do Admin CRUD (link: https://claude.ai/design/p/d711e23e-dea4-49f1-960b-b96f96d68b2f?file=Admin+Pingo+de+Mell.dc.html&via=share). Diferente do front público, essas telas de admin não vão passar por validação com a cliente, a decisão é seguir direto pra implementação sem mostrar pra ela antes.

O layout do Claude Design cobre algumas telas vazias e de erro do CRUD, mas não todas. Decisão registrada em 11/09: pros estados que faltam (vazio, erro, confirmação e afins), o Claude Code monta usando só componentes e tokens já existentes no design system aprovado na Fase 1, sem criar elemento visual novo. Nenhum estado foi marcado como crítico o suficiente pra exigir tela própria antes de codar. Cainan decidiu ver o resultado pronto e ajustar depois se achar necessário, em vez de pedir lista prévia dos estados faltantes.

Marcos de prazo do escopo (dia 15, 30, 45, 60) foram propositalmente deixados de fora do checklist, por pedido do Cainan.

## Acréscimo de escopo registrado em 11/09/2026 — painel de pedidos

Ver seção correspondente no roadmap e no escopo. Resumo: histórico de pedidos e detalhe do pedido entraram no escopo, antes listados como fora dele. O pedido nasce do clique de confirmação no checkout do site, não da leitura da mensagem do WhatsApp.

**Atualização em 11/09/2026:** com exclusão de produto e o teste visual do CAPTCHA confirmados (ver Retrato acima), Cainan decidiu adiantar o painel de pedidos na fila em vez de esperar catálogo, carrinho e checkout (itens 2 a 4 da Fase 2) — o prompt que já estava pronto foi disparado direto. Como o checkout ainda não existe, a tabela `pedidos` está sendo validada com pedidos de teste semeados manualmente no Supabase (mesmo padrão usado pra produto antes do CMS existir), não por um pedido real do carrinho. Catálogo, carrinho e checkout continuam pendentes e vão precisar reaproveitar o schema/RLS/rate limit já criados nessa entrega — não é trabalho perdido, só fora de ordem.

## Observações de risco registradas

O registro do domínio definitivo não deve ficar pra última semana do prazo de 60 dias, por causa do tempo de propagação de DNS, e destrava a atualização do Turnstile com o domínio real.

Como as telas de admin não vão ser validadas com a cliente, o risco de retrabalho por pedido dela fica baixo. O teste visual do CAPTCHA de produção na tela real, que era o bloqueador de fechamento da Fase 0, foi confirmado em 11/09/2026 — bloco fechado.

Risco aceito conscientemente: como os estados faltantes do CRUD vão ser montados pelo Claude Code sem revisão prévia, tem chance de algum ficar abaixo do esperado visualmente. Mitigado só parcialmente pela restrição de usar exclusivamente componentes do design system já aprovado, mas a validação final continua sendo o resultado pronto, não uma prévia.

O acréscimo do painel de pedidos (11/09/2026) trouxe volume de trabalho não previsto nos marcos originais de prazo (dia 15, 30, 45, 60). Ainda não houve conversa sobre revisar esses marcos.

## Painel de pedidos — concluído e em PR, aguardando staging (11/09/2026)

Schema, RLS, rate limit por IP e as duas telas (histórico e detalhe) estão prontos e validados localmente: `scripts/test-rls-pedidos.mjs` 7/7, `scripts/test-rate-limit-pedidos.mjs` bloqueando na 6ª tentativa, 6 pedidos de teste semeados cobrindo os 4 status, cards/busca/filtro/exportação CSV/ações de status conferidos um a um rodando o app local.

PR aberto: https://github.com/cainannog-wq/pingodemell/pull/1 (branch `painel-de-pedidos`). Esse PR também trouxe, em commits separados, todo o trabalho de sessões anteriores que nunca tinha sido commitado (login, CRUD de produto, design system) — até 11/09/2026 só o commit inicial existia no GitHub.

**Sem link de staging ainda**, porque o Netlify nunca foi conectado a este repositório do GitHub (confirmado: PR sem nenhum check de CI, sem comentário de preview do Netlify). Isso é ação de fora do Claude Code — conectar o site Netlify ao repo `cainannog-wq/pingodemell` (Netlify → Add new site → Import from Git). Depois de conectado, esse PR e os próximos passam a ganhar link de preview automático.

## Decisões de checkout fechadas em 14/09/2026

Das três decisões em aberto desde 12/09/2026 (ver checklist, roadmap e escopo), duas foram fechadas nesta conversa: antecedência mínima do pedido (confirmada a regra já desenhada no catálogo público, com exceção manual do admin pra pedido urgente) e aviso de fidelidade no checkout (Claude Code sugeriu o texto em 14/09, aguardando o Cainan escolher a versão final). Foto de referência do bolo personalizado segue em aberto, precisa da resposta da cliente antes de fechar — sem isso, o formulário de checkout (Fase 2, item 4) não pode assumir se vai ter campo de upload ou não.

## Netlify conectado e auditoria de segurança fechada (14/09/2026)

Netlify conectado ao repositório — o bloqueador de staging registrado acima está resolvido; `painel-de-pedidos--pingodemell.netlify.app` (branch) e `pingodemell.netlify.app` (produção) já servem o app de verdade.

Rodada de auditoria de segurança completa (`docs/auditoria-seguranca-prompt.md`), com resultado em `docs/auditoria-seguranca-resultado.md`. Achado crítico (B12 — mass assignment em `pedidos`: insert anônimo direto no banco conseguia forjar status/id/criado_em/total) corrigido via `supabase/pedidos-hardening.sql` e reconfirmado 5/5 contra produção depois do Cainan rodar o SQL. Rate limit e resistência a spoofing de IP também reconfirmados de ponta a ponta contra o Netlify real (não só local). Cabeçalhos de segurança, injeção de fórmula em CSV na exportação de pedidos e uma página de debug esquecida (`/teste-supabase`) também corrigidos.

**Segundo incidente de credencial, já fechado:** durante o teste do Netlify recém-conectado, uma chamada de ferramenta retornou a `SUPABASE_SERVICE_ROLE_KEY` sem máscara (contexto "dev") no histórico desta sessão — mesmo padrão do incidente de 11/09/2026. O Cainan rotacionou a chave no Supabase e atualizou o valor no `.env.local` e no Netlify; a chave nova foi validada contra produção (`test-rls-pedidos.mjs` e `test-mass-assignment-pedidos.mjs`, ambos passando) antes deste commit.

Preview do Netlify (B23) confirmado apontando pro mesmo banco de produção, não um banco separado — aceito por ora (mesmo padrão de qualquer app Supabase sem projeto de staging dedicado), documentado no relatório da auditoria.

## Extensão do cadastro de produto (22/09/2026)

Admin CRUD de produto ganhou prazo de produção, step de quantidade (livre/múltiplos de 5/múltiplos de 10), toggle de destaque, toggle de status ativo/inativo e a categoria "Bebidas" (nova opção numa coluna `Categoria` que já existia no banco, mas nunca era exposta no formulário). Só no CMS, sem efeito no catálogo público/carrinho/checkout ainda. Migração aplicada em produção via MCP do Supabase, com valor padrão nos campos novos pros produtos já cadastrados. `npm run build`, `npm run lint` e a suíte automatizada (`npm run test`, cobrindo o bloqueio de salvar sem prazo de produção ou sem step de quantidade) rodados localmente e limpos. PR aberto, aguardando o Cainan clicar no link de preview do Netlify pra validar visualmente o cadastro com cada combinação de step e os toggles salvando.

## Ajustes no cadastro de produto + diagnóstico de lentidão (22/09/2026, PR #2 ainda aberto)

Na mesma branch/PR da extensão do cadastro de produto (sem merge ainda): preço ganhou máscara de moeda (formatação "R$ 0,00" ao digitar), prazo de produção passou a aceitar 0 dias (produto sempre disponível, ex.: bebida pronta — constraint do banco ajustada em produção), toggle de ativo/inativo direto na listagem (persistindo no Supabase com feedback visual), e o selo de destaque virou um ícone simples. Testes (15 no total), lint e build seguem limpos.

Diagnóstico de lentidão pedido antes de qualquer otimização, sem mexer em código ainda:
- **Causa estrutural confirmada**: a região das Netlify Functions deste deploy é `us-east-2` (Ohio, EUA — `functions_region: "cmh"` e `blobs_region: "us-east-2"` confirmados via API do Netlify), enquanto o projeto Supabase roda em `sa-east-1` (São Paulo). Toda navegação no admin passa pelo middleware de sessão (`src/proxy.ts`, chama `supabase.auth.getUser()`) mais a checagem de auth do layout mais a consulta de dados da própria página — cada uma dessas chamadas ao Supabase cruza esse intervalo Ohio↔São Paulo. Medido diretamente no preview: TTFB estável entre 280-340ms em cargas "quentes" (não é pico único de cold start, é custo por navegação).
- **Achado adicional, e provavelmente o mais visível**: as fontes do Google (`fonts.googleapis.com`) são carregadas via `<link rel="stylesheet">" direto no `<head>` (não via `next/font`, sem `preconnect`), o que bloqueia a renderização. Numa carga fria medida no preview, o HTML terminou de chegar em ~800ms mas o DOM só ficou interativo aos ~5.600ms — um intervalo de quase 5 segundos parado nesse carregamento de fonte externa. Isso pesa mais no primeiro carregamento/recarregamento completo do que na navegação entre telas já com o app carregado (que usa transição client-side do Next.js e não recarrega a fonte).
- **Descartado por enquanto**: paginação/índice — o banco tem só 5 produtos e 6 pedidos, volume não é a causa hoje (mas passa a valer a pena revisitar quando os 60 produtos reais forem cadastrados).
- Nenhuma correção foi aplicada ainda — o Cainan decide se quer tratar isso como urgente (bug real de performance, ex.: trocar as tags de fonte por `next/font`) ou deixar pra a Fase 4 (SEO/Analytics/Lighthouse), que já tem otimização de performance registrada no roadmap.

**Correção aplicada (22/09/2026):** Merriweather, Nunito e Yellowtail trocadas de `<link rel="stylesheet">` pra `next/font/google` (auto-hospedadas, sem round-trip pra fonts.googleapis.com). Material Symbols Rounded (ícone) não é suportada pelo carregador do next/font — continua como `<link>` externo, mas agora com `preconnect` e `display=swap` (antes sem nenhum dos dois). Medido no mesmo preview, antes e depois, no intervalo entre o HTML terminar de chegar e o DOM ficar interativo (o trecho que estava travado por causa da fonte bloqueante):
- Antes: ~4.811ms parado (responseEnd 823ms → domInteractive 5.634ms), carregamento total (loadEventEnd) em 7.861ms
- Depois: ~15ms (responseEnd 635ms → domInteractive 650ms), carregamento total em 1.028ms

Fonte renderiza visualmente igual (mesmo peso, mesmo fallback), conferido lado a lado local vs. preview. Não mexeu no descompasso de região Supabase/Netlify (fora do pedido). `npm run lint`, `npm run build` e os 15 testes automatizados seguem limpos.

## Próximo pedido ao Claude Code

Exclusão de produto e a confirmação visual do CAPTCHA de produção estão fechadas (ver Retrato acima). Painel de pedidos está pronto e agora também auditado — falta só o Cainan revisar/mergear o PR #1. Depois disso, retomar a ordem do roadmap: catálogo público, carrinho, e por fim checkout (item 4), que vai reaproveitar a tabela `pedidos` e o Route Handler de rate limit já prontos (agora também protegidos pela correção do B12).
