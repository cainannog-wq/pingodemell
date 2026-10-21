## Servidor confere passo, soma, repetição e lista dos sabores do Cento

Base `main`, branch `claude/servidor-cento-passo-soma-2ea59e` (um commit, `7c540db`). Só `src/` (a rota e a validação) e o status doc; **sem migração**. Preço do Cento não muda.

### O que muda
`POST /api/pedidos` passa a recusar (400) linha de Cento adulterada, sem recusar nada que a tela permite:
- **Forma** (`validacao.ts`): cada sabor inteiro, 0 ou mais e múltiplo de `PASSO_SABOR`; soma igual a `totalDoCento(centos)`; sem sabor repetido; teto global de 30 sabores por linha.
- **Rota, só com Cento e só depois da forma:** cada sabor tem de estar na lista do próprio produto (`produto_cento_itens`, inclusive sabor inativo, porque a tela mantém no carrinho um sabor que ficou inativo). Produto desconhecido **passa com aviso** no log (a tela permite); falha de leitura sem cópia anterior vira **500** ("Tentar de novo").
- **Leitura:** um cache único de todos os Centos (`src/lib/cache/leitura-servidor.ts`, 5 minutos, chave de serviço), invalidado pelas ações do admin junto da vitrine. Pedido sem Cento nunca lê o banco aqui, e requisição inválida nunca chega à leitura.

### Prova na homologação (feita em 21/10/2026, commit `7c540db`)
- Quatro corpos adulterados voltaram 400 e não gravaram nada.
- O pedido normal feito pela tela (60 coxinhas e 40 kibes, passos de 10) foi gravado: **pedido nº 1059, `teste = true`**, R$ 90,00. Limpeza da numeração para a Fase 5: o 1059 (e qualquer número gasto pela sessão do Cento) sai com os pedidos de teste.

### Migração
Nenhuma. Aditiva/não aditiva: não se aplica.

### Segurança do banco
Sem mudança de banco. Verificador de segurança igual ao de antes (4 INFO de RLS sem política intencionais; WARN de senha vazada).

### Custo
Mexe em `src/`: o merge gera um deploy de produção (15 créditos da Netlify).

### Consequência aceita (pendência do status doc)
O "Cento misto" é só regra de preço, não de passo nem de soma. O lançamento sai com o preço fixo atual dos 3 Centos: um Cento só de sabores caros paga o preço do mais barato (decisão do Cainan, 21/10/2026).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
