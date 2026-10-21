## Kit por pessoa, PR 2: tipo no código, editor de listas e script de carga

**Base: `banco/kit-pessoa` (PR #66).** Branch `kit/pr2-admin-e-carga`. Empilhado: o diff contra a `main` traz também o PR 1 até ele ser mergeado.

### O que traz
- **Tipo `kit_pessoa` no código** (`types.ts`, `campos.ts`, `parse.ts`): para o kit, pedido mínimo, step e unidade são campos escondidos (a edição nunca os grava); o preço aparece como "Preço por pessoa"; o valor neutro de `unidade_venda` passa a depender do tipo ("a pessoa" no kit, nulo nos demais). Combinações válidas: 15 (eram 14).
- **O kit nasce só pela carga.** A opção "Kit por pessoa" do formulário só existe ao editar um produto que já é kit (os instantâneos de visibilidade não mudam), e o cadastro pelo formulário com esse tipo é recusado no servidor.
- **Bloqueio da troca de tipo** (`kit-servidor.ts`): ao salvar, só consulta `kit_grupos` quando o tipo guardado era kit e o enviado é outro; kit com composição não muda de tipo, e produto de outro tipo não vira kit.
- **Editor de listas** em `/admin/kit-listas` (menu Cardápio): adicionar opção, renomear, descrição, ativar e desativar, subir e descer. **Sem função de banco e sem apagar**: reordenar é um `upsert` único por id (`onConflict: id`, só as linhas que mudaram), provado em `scripts/banco/kit-pessoa.mjs` (59 a 64). Cada ação invalida a vitrine (guarda `invalidacao-vitrine.test.ts` estendida).
- **Script de carga** (`scripts/carga/kit-pessoa-carga.mjs`, regras em `kit-pessoa-lib.mjs`): ensaio (padrão, ROLLBACK), `--ida-e-volta`, `--aplicar` (exige `--plano-sha` e `--md5` do ensaio e recusa sem o enum), `--desfazer`. Kit nasce inativo, sem capa, com o menor tamanho como pedido mínimo. Relatório de divergências.

### Migração
**Nenhuma nova.** As duas do PR 1 (`produto_tipo_kit_pessoa` e `kit_pessoa_schema`) foram aplicadas em produção em 21/10/2026 (aditivas, antes do merge, com o ok escrito do Cainan).

### Segurança do banco
Verificador de segurança, antes e depois das migrações do PR 1: igual (4 INFO de RLS sem política em `privado.exclusao_registro`, `heartbeat`, `pedidos_gravacao` e `pedidos_rate_limit`, intencionais; WARN de senha vazada, do Auth). Desempenho: 1 INFO novo, `kit_quantidades_grupo_lista_fkey` sem índice próprio (coberta pelo prefixo de `kit_quantidades_grupo_idx`), não corrigido.

### Testes
Suíte inteira: 268 arquivos, 3860 testes, nos dois fusos; `tsc`, `eslint` e `next build` limpos. `rodar-todos.mjs` depois das migrações: tudo PASS, com os testes 42 e 43 do `kit-pessoa.mjs`, exceto o `i3` de `subcategorias.mjs` (anterior, corrigido em PR à parte).

### Não provado
O editor no navegador com dados reais (precisa de uma lista; vem com a carga). A camada do `supabase-js` do upsert só tem teste com banco simulado; o mesmo upsert foi provado em SQL.

### Custo
Mexe em `src/`: 15 créditos da Netlify no merge.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
