## PR infra: `infra/vitest-eol-snap` (base `main`)

- `.gitattributes` com `*.snap text eol=lf`: o vitest grava os instantâneos com LF e, com `core.autocrlf=true`, o `.snap` aparecia como modificado depois de toda rodada.
- `vitest.config.ts` exclui `**/.claude/**`: a suíte da cópia principal não executa os testes das worktrees de outras sessões (chegou a falhar 55 testes de trabalho em andamento delas).
- Sem migração. **Custo: 15 créditos** (a regra de ignorar build não cobre `vitest.config.ts` nem `.gitattributes`). Suíte: 258 arquivos, 3748 testes.

## PR i3: `claude/fix-teste-subcategorias-i3-81b672` (base `main`)

- `scripts/banco/subcategorias.mjs` (i3): confere o aumento da contagem (+2 e +0) em vez do valor absoluto, que a carga de 13/10 (195 vínculos) invalidou. `rodar-todos.mjs` sai com código 0, banco idêntico. Só `scripts/`: 0 crédito.
