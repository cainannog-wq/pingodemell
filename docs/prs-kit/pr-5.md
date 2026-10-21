## Kit por pessoa, PR 5: CSV da carga real (nada gravado)

**Base: `kit/pr34-site-e-servidor`.** Branch `kit/pr5-carga-real`. Só `scripts/` e docs: a regra de ignorar build não gera deploy (0 crédito). **Nenhuma carga foi aplicada.**

### O que traz
- `scripts/carga/kit-pessoa-real/`: os cinco CSV da carga real, gerados por `gerar.mjs` a partir das regras e das tabelas de quantidade do Cainan (21/10/2026): 7 listas (47 opções, a última de recheios com "acréscimo a combinar no WhatsApp"), 3 kits (R$ 22, R$ 34 e R$ 37 por pessoa), 15 grupos, **31 tamanhos** e 165 quantidades. Básico escolhe Cini ou Coca (quantidade e rótulo por tamanho); Clássico e Premium só Coca 2L fixa. Descartáveis de 20 pessoas em diante. As três quantidades arredondadas para baixo (170, 70 e 60) e o máximo de sabores só em assados e sanduíches.
- Script de carga: `--criar-subcategoria="Por pessoa"` cria a subcategoria na mesma transação (o desfazer a apaga); a lib aceita `destaque` vazio com `herda_destaque_de`.
- `kit-pessoa-real.test.mjs`: sem erro nem aviso, 31 tamanhos e preços iguais aos do kit antigo, quantidades-chave, listas, bebida, bolo e descartáveis, destaque herdado, sem hífen nem emoji.

### Ensaio contra o banco (21/10/2026, com as migrações já aplicadas, ROLLBACK)
`node scripts/carga/kit-pessoa-carga.mjs --pasta=scripts/carga/kit-pessoa-real --criar-subcategoria="Por pessoa" --ida-e-volta`: cria a subcategoria `por-pessoa`, 7 listas, 47 opções, 3 produtos **inativos** (`kit-festa-basico`, `kit-festa-classico`, `kit-festa-premium`, slugs livres; Básico com destaque herdado), 15 grupos, 31 tamanhos e 165 quantidades; o md5 dos 218 produtos existentes fica igual e a ida e volta devolve tudo ao início. Nada foi gravado.

### Falta para a carga de verdade (precisa do ok escrito do Cainan)
1. Revisar os CSV e as três descrições (texto novo, em `produtos.csv`).
2. Ensaio sem gravar (o comando acima, sem `--ida-e-volta`) para pegar o `--plano-sha` e o `--md5`; depois `--aplicar` com os dois.
3. Capa e fotos dos três kits pelo admin (a carga não sobe imagem) e conferência pela prévia `/previa/{slug}`.
4. Ativar os três e desativar os 31 antigos, por último, num passo à parte (gatilho `produtos_set_atualizado_em` desligado na transação para não reordenar "Os mais pedidos"), e um Salvar no admin (ou deploy) para limpar o cache da vitrine.
5. Reordenar a subcategoria "Por pessoa" para o início e desativar Básico, Clássico e Premium antigas quando ficarem sem produto.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
