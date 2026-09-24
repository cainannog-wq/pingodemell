# Escopo — Site Pingo de Mell

## Objetivo

Site de catálogo para a Pingo de Mell (bolos, doces e salgados), com carrinho sem pagamento online, fechando pedido via WhatsApp, mais um CMS pra o cliente cadastrar e gerenciar os próprios produtos sem depender de desenvolvedor. O CMS também registra e acompanha os pedidos fechados pelo carrinho, com status atualizado manualmente pela loja.

## Quem usa o quê

Cliente final: navega o catálogo, monta carrinho, preenche os dados do pedido e envia pelo WhatsApp. Não precisa de login.

Dono da Pingo de Mell: acessa o CMS com email e senha, cadastra produto, sobe foto, edita preço e quantidade mínima, acompanha e atualiza o status dos pedidos recebidos. Usuário único de admin. O nome de exibição do painel (ex.: "Marina Alves", "Painel da equipe") é só rótulo da mesma conta única, não implica multiusuário nem permissão por papel.

## Escopo incluído

Catálogo público
- Listagem de produtos com foto, nome, preço e descrição
- Filtro ou categoria, se o volume de 60 produtos justificar navegação por tipo (bolo, doce, salgado)

Carrinho
- Adicionar, remover e ajustar quantidade de item
- Respeitar pedido_minimo por produto, com seletor que trava no mínimo e mensagem "Quantidade mínima: X"

Checkout e pedido
- Antes de fechar o pedido, formulário com nome, WhatsApp, email, ocasião, modo e endereço de entrega, data e hora, forma de pagamento e observações
- Ao confirmar, o pedido é gravado na tabela de pedidos do Supabase e, na sequência, o WhatsApp abre com a mensagem formatada. O site não lê nem depende do conteúdo real da mensagem enviada, o registro nasce do clique de confirmação no site, não da conversa no WhatsApp
- Sem pagamento processado no site, em nenhuma etapa
- Validação de campo obrigatório no formulário e limite de taxa por IP no backend, para conter spam ou flood de pedido falso, já que o pedido é aceito sem login (a gravação é sempre feita pelo servidor, que aplica essa validação e esse limite). Sem CAPTCHA visível nessa tela, para não acrescentar fricção ao cliente final

Painel de pedidos (CMS)
- Histórico de pedidos: listagem com busca por cliente ou número do pedido, filtro por status, cards de resumo (pedidos no mês, aguardando confirmação, entregues, valor no mês)
- Detalhe do pedido: itens, dados do cliente, entrega e pagamento, observações, linha do tempo do andamento
- Atualização de status feita manualmente pelo admin (mover para produção, marcar como entregue, cancelar pedido). Nenhum status é inferido automaticamente do WhatsApp
- Exportação da listagem filtrada em planilha (CSV ou Excel), sem relatório financeiro elaborado

CMS de produtos
- Login email e senha, sem cadastro público, usuário único criado manualmente
- CRUD completo de produto: nome, preço, descrição, foto, quantidade mínima, categoria (bolo, doce, salgado, bebida), prazo de produção (dias), step de quantidade (livre, múltiplos de 5, múltiplos de 10), produto em destaque, status ativo/inativo
- Upload de imagem pelo próprio painel
- Prazo de produção, step de quantidade, destaque e status existem só no CMS nesta entrega, sem efeito ainda no catálogo público, carrinho ou checkout — isso é trabalho de um bloco futuro

Segurança
- RLS ativo desde a criação das tabelas
- Produto: leitura pública, escrita restrita a usuário autenticado
- Pedido: a cliente pede sem login, mas o pedido só é gravado pelo servidor (POST /api/pedidos, com validação e limite por IP); nenhum papel da API grava direto na tabela. Leitura e atualização (update) restritas a usuário autenticado
- Teste automatizado provando que o bloqueio de RLS funciona nas duas tabelas, incluindo confirmar que um visitante anônimo não consegue gravar, ler nem alterar pedido direto pela API, e que o servidor continua gravando o pedido

SEO básico
- Meta tags e sitemap

Analytics
- Banner de consentimento de cookie (LGPD), bloqueando carregamento de tag até aceite
- Tags do Google Analytics 4 e Microsoft Clarity, carregando só após consentimento
- Verificação de propriedade no Google Search Console e envio do sitemap
- Relatório de tráfego via Looker Studio, embutido em tela própria do CMS, acesso restrito ao usuário admin logado

## Fora de escopo (nessa entrega)

- Pagamento online de qualquer tipo, gateway, PIX automatizado, cartão
- Mais de um usuário admin ou permissão por papel
- Recuperação de senha automatizada, 2FA
- Structured data de produto (schema.org) e otimização fina de performance (Lighthouse), ficam para depois do lançamento
- Cadastro ou login de cliente final
- Integração real com a API oficial do WhatsApp Business (Meta Cloud API), leitura ou parsing automático do conteúdo da mensagem enviada, e qualquer automação que dependa disso. O pedido é registrado pelo formulário do site no momento da confirmação, não pela mensagem em si
- Relatório financeiro elaborado dentro do CMS, além dos cards de resumo e da exportação de planilha já incluídos

## Telas (9, a confirmar com você)

1. Catálogo (home, listagem de produtos)
2. Carrinho
3. Checkout (formulário de dados do cliente antes de abrir o WhatsApp)
4. Confirmação de pedido antes de redirecionar pro WhatsApp
5. Login do admin
6. Painel do CMS, listagem de produtos cadastrados
7. Formulário de cadastro e edição de produto
8. Histórico de pedidos
9. Detalhe do pedido

Essa lista incorpora, em 11/09/2026, o acréscimo de escopo do painel de pedidos, que antes estava listado como fora de escopo. As telas 3, 4, 8 e 9 ainda não confirmadas por você, valem revisão antes de virar prompt pro Claude Code.

## Regras de negócio já fechadas

- Pedido mínimo por produto, editável no CMS, sem step de quantidade por enquanto
- Catálogo com cerca de 60 produtos, carga inicial parcial semeada manualmente no Supabase pra destravar o desenvolvimento do front antes do CMS existir, carga real dos 60 feita depois pelo próprio CMS como teste de usabilidade
- Pedido nasce no clique de confirmação no site, não na leitura da mensagem do WhatsApp. Status do pedido é sempre atualizado manualmente pelo admin
- Antecedência mínima do pedido, fechada em 14/09/2026, confirmando a regra que já estava no layout do catálogo público desenhado no Claude Design: dia de semana, pedido com 1 dia de antecedência; fim de semana, pedido até quinta-feira; sem atendimento a entrega numa segunda-feira. O checkout deve travar a escolha de data fora desse limite. Exceção: essa trava vale só pro fluxo público do site — o admin pode abrir manualmente, pelo painel, um pedido fora desse limite, pra atender um caso urgente
- Aviso de fidelidade, fechado em 14/09/2026: o checkout mostra um aviso avisando que o resultado final é trabalho artesanal e pode variar em relação à foto de referência enviada. Texto exato sugerido pelo Claude Code em 14/09, aguardando o Cainan escolher entre as opções antes de virar prompt de implementação

## Mudança de decisão registrada em 22/09/2026 — step de quantidade

O "step de quantidade" estava listado como fora de escopo nesta entrega (múltiplos fixos por pedido). Decisão revertida em 22/09/2026: o campo entrou no CRUD de produto do CMS, com três opções (livre, múltiplos de 5, múltiplos de 10), obrigatório, padrão "livre". Por enquanto o campo só existe e é editável no CMS — o carrinho público ainda não lê nem aplica esse valor, isso fica para quando o carrinho (Fase 2, item 3) for implementado.

## Mudança de decisão registrada em 24/09/2026 — gravação de pedido

A regra "Pedido: escrita (insert) pública sem autenticação" mudou no PR seguranca-api: a cliente continua pedindo sem login, mas o pedido só é gravado pelo servidor (POST /api/pedidos, com validação e limite por IP). Nenhum papel da API grava direto na tabela de pedidos — antes, um visitante podia pular o servidor e, com isso, o limite por IP. Ver roadmap.

## Decisões em aberto

- Foto de referência do bolo personalizado (envio pelo cliente no checkout): ainda em aberto em 14/09/2026, precisa da resposta da cliente antes de fechar. Se for por upload no site, a imagem fica junto do pedido gravado no Supabase (aparece no histórico e no detalhe do pedido no painel), mas exige endurecer a proteção da gravação de pedido sem login (feita pelo servidor) — tipo e tamanho de arquivo, limite de volume — além do que já existe hoje (rate limit por IP e campo obrigatório, sem CAPTCHA). Se for pelo WhatsApp, a foto fica fora do registro no Supabase e não aparece no painel. Ver detalhamento no roadmap.

## Stack

Netlify (hospedagem) e Supabase (banco, storage, autenticação)

## Prazo e marcos

60 dias no total.
- Dia 15: layout das telas aprovado
- Dia 30: front funcionando, com produto semeado manualmente
- Dia 45: CMS funcionando, 60 produtos reais cadastrados
- Dia 60: entrega final

Atenção: o acréscimo do painel de pedidos, registrado em 11/09/2026, não estava previsto quando esses marcos foram definidos. Três telas novas, uma tabela nova com RLS de escrita pública e um formulário de checkout novo é volume de trabalho real, não ajuste cosmético. Vale revisitar se o marco do dia 45 ou o prazo final do dia 60 ainda são realistas, em vez de assumir que cabem no mesmo prazo original sem conversa.
