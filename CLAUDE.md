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
