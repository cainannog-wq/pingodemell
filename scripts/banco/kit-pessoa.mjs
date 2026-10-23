// Kit Festa por pessoa (supabase/produto-tipo-kit-pessoa.sql e
// supabase/kit-pessoa-schema.sql), numa transação desfeita — nada é gravado.
// Prova: RLS (anônimo lê só o que é de produto ativo e só item ativo de lista;
// logado lê tudo e escreve; ninguém trunca), restrições de dados (grupo
// coerente com o modo, meio quilo, duplicidade), cascatas e o valor novo do
// enum produto_tipo.
//
// As tabelas só existem depois de aplicadas: sem elas, o script avisa e pula.
// Use --com-migracao=supabase/produto-tipo-kit-pessoa.sql,supabase/kit-pessoa-schema.sql
// para provar antes de aplicar. Nesse caso o valor novo do enum foi criado na
// mesma transação e não pode ser usado nela: os produtos do teste são do tipo
// normal (as tabelas não conferem o tipo do produto) e a parte do enum é
// pulada com aviso.
//
// Uso: node scripts/banco/kit-pessoa.mjs [--com-migracao=<arquivo.sql>[,<outro.sql>]]

import { cenario, descrever, emTransacaoDesfeita, nomeDaCategoriaKit, pular, registrar } from "./lib.mjs";

const ATIVO = "PROVA_TRANSACAO_KIT_ATIVO";
const INATIVO = "PROVA_TRANSACAO_KIT_INATIVO";

async function criarProdutos(c, categoria) {
  const { rows } = await c.q(
    `insert into public.produtos (nome, preco, pedido_minimo, tipo, "Categoria", ativo)
     values ($1, 22, 10, 'normal', $3, true), ($2, 22, 10, 'normal', $3, false)
     returning id, nome`,
    [ATIVO, INATIVO, categoria]
  );
  const id = (nome) => rows.find((r) => r.nome === nome).id;
  return { ativo: id(ATIVO), inativo: id(INATIVO) };
}

// Monta um kit completo e pequeno para um produto: lista de recheios, lista de
// bebidas (duas opções), grupo de recheio, de doces, de bebida e fixo; tamanhos
// 10 e 15 (1 e 1,5 kg) e as quantidades.
async function montarKit(c, produtoId, sufixo) {
  const listas = await c.q(
    `insert into public.kit_listas (nome) values ($1), ($2), ($3) returning id, nome`,
    [`Recheios ${sufixo}`, `Doces ${sufixo}`, `Bebidas ${sufixo}`]
  );
  const lista = (nome) => listas.rows.find((l) => l.nome === `${nome} ${sufixo}`).id;
  const itens = await c.q(
    `insert into public.kit_lista_itens (lista_id, nome, descricao, posicao, ativo) values
       ($1, 'Morango com chocolate', null, 1, true),
       ($1, 'Recheios com chocolate', 'acréscimo a combinar no WhatsApp', 2, true),
       ($1, 'Recheio escondido', null, 3, false),
       ($2, 'Brigadeiro', null, 1, true),
       ($2, 'Beijinho', null, 2, true),
       ($3, 'Cini 2L', null, 1, true),
       ($3, 'Coca 2L', null, 2, true)
     returning id, lista_id, nome`,
    [lista("Recheios"), lista("Doces"), lista("Bebidas")]
  );
  const item = (nome) => itens.rows.find((i) => i.nome === nome).id;
  const grupos = await c.q(
    `insert into public.kit_grupos (produto_id, chave, rotulo, modo, lista_id, passo, posicao) values
       ($1, 'recheio', 'Recheio do bolo', 'escolha_unica', $2, null, 1),
       ($1, 'doces', 'Doces', 'distribuicao', $3, 10, 2),
       ($1, 'bebida', 'Bebida', 'escolha_unica', $4, null, 3),
       ($1, 'descartavel', 'Descartáveis', 'fixo', null, null, 4)
     returning id, chave`,
    [produtoId, lista("Recheios"), lista("Doces"), lista("Bebidas")]
  );
  const grupo = (chave) => grupos.rows.find((g) => g.chave === chave).id;
  await c.q(
    `insert into public.kit_tamanhos (produto_id, pessoas, bolo_kg, descartaveis) values ($1, 10, 1, false), ($1, 15, 1.5, false)`,
    [produtoId]
  );
  await c.q(
    `insert into public.kit_quantidades (produto_id, pessoas, grupo_id, lista_id, opcao_id, total, max_sabores, rotulo) values
       ($1, 10, $2, null, null, 50, null, null),
       ($1, 15, $2, null, null, 120, null, null),
       ($1, 10, $3, $6, $4, 2, null, '2 Cini 2L'),
       ($1, 10, $3, $6, $5, 1, null, '1 Coca 2L'),
       ($1, 15, $3, $6, $4, 2, null, '2 Cini 2L'),
       ($1, 15, $3, $6, $5, 1, null, '1 Coca 2L')`,
    [produtoId, grupo("doces"), grupo("bebida"), item("Cini 2L"), item("Coca 2L"), lista("Bebidas")]
  );
  return { listas: listas.rows, grupo, item, lista };
}

await emTransacaoDesfeita("Kit Festa por pessoa (kit_pessoa)", async (db) => {
  const existe = await db.query("select to_regclass('public.kit_quantidades') as t");
  if (!existe.rows[0].t) {
    pular(
      "kit pessoa (todos)",
      "as tabelas do kit não existem; use --com-migracao=supabase/produto-tipo-kit-pessoa.sql,supabase/kit-pessoa-schema.sql"
    );
    return;
  }
  const categoria = await nomeDaCategoriaKit(db);

  // 1. RLS do anônimo.
  await cenario(db, async (c) => {
    const p = await criarProdutos(c, categoria);
    const kitA = await montarKit(c, p.ativo, "ZZPA");
    await montarKit(c, p.inativo, "ZZPI");
    await c.como("anon");
    const grupos = await c.tentar("select produto_id from public.kit_grupos where produto_id in ($1, $2)", [p.ativo, p.inativo]);
    const tamanhos = await c.tentar("select produto_id from public.kit_tamanhos where produto_id in ($1, $2)", [p.ativo, p.inativo]);
    const qtds = await c.tentar("select produto_id from public.kit_quantidades where produto_id in ($1, $2)", [p.ativo, p.inativo]);
    const soAtivo = (r, n) => r.ok && r.rows.length === n && r.rows.every((x) => x.produto_id === p.ativo);
    registrar("kit 1. anônimo lê os grupos só de produto ativo", soAtivo(grupos, 4), descrever(grupos));
    registrar("kit 2. anônimo lê os tamanhos só de produto ativo", soAtivo(tamanhos, 2), descrever(tamanhos));
    registrar("kit 3. anônimo lê as quantidades só de produto ativo", soAtivo(qtds, 6), descrever(qtds));

    const listas = await c.tentar("select nome from public.kit_listas where nome like '% ZZPA' or nome like '% ZZPI' order by nome");
    registrar(
      "kit 4. anônimo lê só as listas usadas por produto ativo",
      listas.ok && listas.rows.map((l) => l.nome).join("|") === "Bebidas ZZPA|Doces ZZPA|Recheios ZZPA",
      listas.ok ? listas.rows.map((l) => l.nome).join("|") : descrever(listas)
    );
    const itens = await c.tentar(
      "select i.nome from public.kit_lista_itens i join public.kit_listas l on l.id = i.lista_id where l.nome = 'Recheios ZZPA' order by i.posicao"
    );
    registrar(
      "kit 5. anônimo não vê item inativo da lista nem item de lista de produto inativo",
      itens.ok && itens.rows.map((i) => i.nome).join("|") === "Morango com chocolate|Recheios com chocolate",
      itens.ok ? itens.rows.map((i) => i.nome).join("|") : descrever(itens)
    );
    const inativos = await c.tentar("select count(*)::int n from public.kit_lista_itens i join public.kit_listas l on l.id = i.lista_id where l.nome like '% ZZPI'");
    registrar("kit 6. nenhum item de lista de produto inativo aparece ao anônimo", inativos.ok && inativos.rows[0].n === 0, descrever(inativos));

    const escritas = [
      ["lista", "insert into public.kit_listas (nome) values ('Nova')"],
      ["item", "insert into public.kit_lista_itens (lista_id, nome, posicao) select id, 'X', 9 from public.kit_listas where nome = 'Doces ZZPA'"],
      ["grupo", "insert into public.kit_grupos (produto_id, chave, rotulo, modo, posicao) values ($1, 'x', 'X', 'fixo', 9)"],
      ["tamanho", "insert into public.kit_tamanhos (produto_id, pessoas, bolo_kg, descartaveis) values ($1, 20, 2, true)"],
    ];
    const recusadas = [];
    for (const [nome, sql] of escritas) {
      const r = await c.tentar(sql, sql.includes("$1") ? [p.ativo] : undefined);
      if (r.ok) recusadas.push(nome);
    }
    const altera = await c.tentar("update public.kit_tamanhos set bolo_kg = 9 where produto_id = $1", [p.ativo]);
    const apaga = await c.tentar("delete from public.kit_quantidades where produto_id = $1", [p.ativo]);
    const trunca = [];
    for (const t of ["kit_listas", "kit_lista_itens", "kit_grupos", "kit_tamanhos", "kit_quantidades"]) {
      const r = await c.tentar(`truncate public.${t}`);
      if (r.ok) trunca.push(t);
    }
    await c.dono();
    const restam = await c.q("select count(*)::int n from public.kit_quantidades where produto_id = $1", [p.ativo]);
    const tam = await c.q("select bolo_kg from public.kit_tamanhos where produto_id = $1 order by pessoas", [p.ativo]);
    registrar("kit 7. anônimo não insere em nenhuma tabela do kit", recusadas.length === 0, recusadas.length ? `aceitou: ${recusadas.join(", ")}` : "nenhuma aceita");
    registrar(
      "kit 8. anônimo não altera nem apaga",
      (!altera.ok || altera.rowCount === 0) && (!apaga.ok || apaga.rowCount === 0) && restam.rows[0].n === 6 && Number(tam.rows[0].bolo_kg) === 1,
      `${descrever(altera)}; ${descrever(apaga)}`
    );
    registrar("kit 9. anônimo não trunca", trunca.length === 0, trunca.length ? `truncou: ${trunca.join(", ")}` : "nenhuma tabela");
    void kitA;
  });

  // 2. Logado: lê tudo, escreve, não trunca.
  await cenario(db, async (c) => {
    const p = await criarProdutos(c, categoria);
    await montarKit(c, p.inativo, "ZZPL");
    await c.como("authenticated");
    const le = await c.tentar("select count(*)::int n from public.kit_grupos where produto_id = $1", [p.inativo]);
    const leItens = await c.tentar("select count(*)::int n from public.kit_lista_itens i join public.kit_listas l on l.id = i.lista_id where l.nome = 'Recheios ZZPL'");
    registrar("kit 10. logado lê também o que é de produto inativo e o item inativo", le.ok && le.rows[0].n === 4 && leItens.ok && leItens.rows[0].n === 3, `${descrever(le)}; itens ${leItens.ok ? leItens.rows[0].n : "?"}`);

    const lista = await c.tentar("insert into public.kit_listas (nome) values ('Fritos ZZPL') returning id");
    const item = await c.tentar("insert into public.kit_lista_itens (lista_id, nome, posicao) values ($1, 'Coxinha', 1)", [lista.rows?.[0]?.id]);
    // Só o item desta prova: sem o filtro por lista, o update pegava também os
    // itens reais de mesmo nome que a carga dos kits já cadastrou (2 linhas).
    const altera = await c.tentar("update public.kit_lista_itens set ativo = false where lista_id = $1 and nome = 'Coxinha'", [lista.rows?.[0]?.id]);
    const tam = await c.tentar("insert into public.kit_tamanhos (produto_id, pessoas, bolo_kg, descartaveis) values ($1, 20, 2, true)", [p.inativo]);
    const apaga = await c.tentar("delete from public.kit_quantidades where produto_id = $1", [p.inativo]);
    registrar(
      "kit 11. logado cria lista e item, altera, cadastra tamanho e apaga quantidades",
      lista.ok && item.ok && altera.ok && altera.rowCount === 1 && tam.ok && apaga.ok && apaga.rowCount === 6,
      [lista, item, altera, tam, apaga].map(descrever).join("; ")
    );
    const trunca = [];
    for (const t of ["kit_listas", "kit_lista_itens", "kit_grupos", "kit_tamanhos", "kit_quantidades"]) {
      const r = await c.tentar(`truncate public.${t}`);
      if (r.ok) trunca.push(t);
    }
    registrar("kit 12. logado não trunca", trunca.length === 0, trunca.length ? `truncou: ${trunca.join(", ")}` : "nenhuma tabela");
  });

  // 3. Restrições de dados.
  await cenario(db, async (c) => {
    const p = await criarProdutos(c, categoria);
    const kit = await montarKit(c, p.ativo, "ZZPR");
    await c.como("authenticated");
    const nega = async (nome, sql, args) => {
      const r = await c.tentar(sql, args);
      registrar(nome, !r.ok, descrever(r));
    };
    const aceita = async (nome, sql, args) => {
      const r = await c.tentar(sql, args);
      registrar(nome, r.ok, descrever(r));
    };
    const doces = kit.lista("Doces");
    await nega("kit 13. lista com o mesmo nome (sem diferenciar maiúscula) é recusada", "insert into public.kit_listas (nome) values ('doces zzpr')");
    await nega("kit 14. item repetido na lista (sem diferenciar maiúscula) é recusado", "insert into public.kit_lista_itens (lista_id, nome, posicao) values ($1, 'BRIGADEIRO', 9)", [doces]);
    await nega("kit 15. nome de item com espaço sobrando é recusado", "insert into public.kit_lista_itens (lista_id, nome, posicao) values ($1, ' Novo', 9)", [doces]);
    await nega("kit 16. descrição vazia ou com espaço sobrando é recusada", "insert into public.kit_lista_itens (lista_id, nome, descricao, posicao) values ($1, 'Novo', ' x', 9)", [doces]);
    await aceita("kit 17. descrição opcional aceita texto", "insert into public.kit_lista_itens (lista_id, nome, descricao, posicao) values ($1, 'Novo', 'acréscimo a combinar no WhatsApp', 9)", [doces]);

    await nega("kit 19. grupo de distribuição sem lista é recusado", "insert into public.kit_grupos (produto_id, chave, rotulo, modo, passo, posicao) values ($1, 'f', 'F', 'distribuicao', 10, 9)", [p.ativo]);
    await nega("kit 20. grupo de distribuição sem passo é recusado", "insert into public.kit_grupos (produto_id, chave, rotulo, modo, lista_id, posicao) values ($1, 'f', 'F', 'distribuicao', $2, 9)", [p.ativo, doces]);
    await nega("kit 21. grupo fixo com lista é recusado", "insert into public.kit_grupos (produto_id, chave, rotulo, modo, lista_id, posicao) values ($1, 'f', 'F', 'fixo', $2, 9)", [p.ativo, doces]);
    await nega("kit 22. grupo de escolha única com passo é recusado", "insert into public.kit_grupos (produto_id, chave, rotulo, modo, lista_id, passo, posicao) values ($1, 'f', 'F', 'escolha_unica', $2, 10, 9)", [p.ativo, doces]);
    await nega("kit 23. modo desconhecido é recusado", "insert into public.kit_grupos (produto_id, chave, rotulo, modo, posicao) values ($1, 'f', 'F', 'qualquer', 9)", [p.ativo]);
    await nega("kit 24. chave de grupo repetida no produto é recusada", "insert into public.kit_grupos (produto_id, chave, rotulo, modo, posicao) values ($1, 'descartavel', 'F', 'fixo', 9)", [p.ativo]);
    await nega("kit 25. chave de grupo fora do formato é recusada", "insert into public.kit_grupos (produto_id, chave, rotulo, modo, posicao) values ($1, 'Doces Finos', 'F', 'fixo', 9)", [p.ativo]);

    await aceita("kit 26. tamanho de 20 pessoas com 2 kg", "insert into public.kit_tamanhos (produto_id, pessoas, bolo_kg, descartaveis) values ($1, 20, 2, true)", [p.ativo]);
    await aceita("kit 27. meio quilo é aceito (1,5 kg já está no kit montado)", "insert into public.kit_tamanhos (produto_id, pessoas, bolo_kg, descartaveis) values ($1, 30, 3.5, true)", [p.ativo]);
    await nega("kit 28. bolo de 1,3 kg (fora do meio em meio quilo) é recusado", "insert into public.kit_tamanhos (produto_id, pessoas, bolo_kg, descartaveis) values ($1, 40, 1.3, true)", [p.ativo]);
    await nega("kit 29. bolo de 0 kg é recusado", "insert into public.kit_tamanhos (produto_id, pessoas, bolo_kg, descartaveis) values ($1, 40, 0, true)", [p.ativo]);
    await nega("kit 30. tamanho repetido no produto é recusado", "insert into public.kit_tamanhos (produto_id, pessoas, bolo_kg, descartaveis) values ($1, 10, 1, true)", [p.ativo]);

    const bebida = kit.grupo("bebida");
    const doce = kit.grupo("doces");
    await nega("kit 31. quantidade repetida (tamanho, grupo e opção nula) é recusada", "insert into public.kit_quantidades (produto_id, pessoas, grupo_id, total) values ($1, 10, $2, 60)", [p.ativo, doce]);
    await nega("kit 32. quantidade repetida para a mesma opção é recusada", "insert into public.kit_quantidades (produto_id, pessoas, grupo_id, lista_id, opcao_id, total) values ($1, 10, $2, $4, $3, 3)", [p.ativo, bebida, kit.item("Cini 2L"), kit.lista("Bebidas")]);
    await nega("kit 33. total zero é recusado", "insert into public.kit_quantidades (produto_id, pessoas, grupo_id, opcao_id, total) values ($1, 15, $2, null, 0)", [p.ativo, kit.grupo("recheio")]);
    await nega("kit 34. máximo de sabores zero é recusado", "insert into public.kit_quantidades (produto_id, pessoas, grupo_id, total, max_sabores) values ($1, 15, $2, 10, 0)", [p.ativo, kit.grupo("recheio")]);
    await nega("kit 35. quantidade para tamanho que não existe é recusada", "insert into public.kit_quantidades (produto_id, pessoas, grupo_id, total) values ($1, 99, $2, 10)", [p.ativo, kit.grupo("recheio")]);
    // Colunas anuláveis dentro de CHECK: um resultado nulo aprovaria a linha, então
    // cada combinação inválida de modo, lista e passo tem o seu caso.
    await nega("kit 44. grupo de escolha única sem lista é recusado", "insert into public.kit_grupos (produto_id, chave, rotulo, modo, posicao) values ($1, 'f1', 'F', 'escolha_unica', 9)", [p.ativo]);
    await nega("kit 45. grupo fixo com passo é recusado", "insert into public.kit_grupos (produto_id, chave, rotulo, modo, passo, posicao) values ($1, 'f2', 'F', 'fixo', 10, 9)", [p.ativo]);
    await nega("kit 46. grupo de distribuição com passo 0 é recusado", "insert into public.kit_grupos (produto_id, chave, rotulo, modo, lista_id, passo, posicao) values ($1, 'f3', 'F', 'distribuicao', $2, 0, 9)", [p.ativo, doces]);
    await nega("kit 47. grupo de distribuição com passo 101 é recusado", "insert into public.kit_grupos (produto_id, chave, rotulo, modo, lista_id, passo, posicao) values ($1, 'f4', 'F', 'distribuicao', $2, 101, 9)", [p.ativo, doces]);
    await aceita("kit 48. grupo de distribuição com lista e passo 10 é aceito", "insert into public.kit_grupos (produto_id, chave, rotulo, modo, lista_id, passo, posicao) values ($1, 'f5', 'F', 'distribuicao', $2, 10, 9)", [p.ativo, doces]);
  });

  // 3b. Integridade da opção: a opção pertence à lista informada e essa lista é a
  // do grupo (chaves compostas). Cada tamanho usado uma vez, para a recusa vir da
  // chave estrangeira e não de linha repetida.
  await cenario(db, async (c) => {
    const p = await criarProdutos(c, categoria);
    const kit = await montarKit(c, p.ativo, "ZZPK");
    for (const n of [20, 30, 40, 50, 60, 70]) {
      await c.q("insert into public.kit_tamanhos (produto_id, pessoas, bolo_kg, descartaveis) values ($1, $2, 2, true)", [p.ativo, n]);
    }
    await c.como("authenticated");
    const bebida = kit.grupo("bebida");
    const listaBebidas = kit.lista("Bebidas");
    const listaDoces = kit.lista("Doces");
    const brigadeiro = kit.item("Brigadeiro");
    const cini = kit.item("Cini 2L");
    const insere = (pessoas, lista, opcao) =>
      c.tentar(
        "insert into public.kit_quantidades (produto_id, pessoas, grupo_id, lista_id, opcao_id, total) values ($1, $2, $3, $4, $5, 2)",
        [p.ativo, pessoas, bebida, lista, opcao]
      );
    const quem = (r) => (r.ok ? "aceito" : `${r.code} ${r.message.match(/constraint "([^"]+)"/)?.[1] ?? ""}`);
    const certa = await insere(20, listaBebidas, cini);
    registrar("kit 51. opção da lista do grupo, com a lista informada certa, é aceita", certa.ok, quem(certa));
    const outraLista = await insere(30, listaDoces, brigadeiro);
    registrar("kit 52. opção de OUTRA lista (Doces num grupo de Bebidas) é recusada pela chave da lista do grupo", !outraLista.ok && outraLista.code === "23503", quem(outraLista));
    const mentindo = await insere(40, listaBebidas, brigadeiro);
    registrar("kit 53. opção de Doces dizendo ser de Bebidas é recusada pela chave da opção", !mentindo.ok && mentindo.code === "23503", quem(mentindo));
    const semLista = await insere(50, null, cini);
    registrar("kit 54. opção sem lista informada é recusada", !semLista.ok && semLista.code === "23514", quem(semLista));
    const semOpcao = await insere(60, listaBebidas, null);
    registrar("kit 55. lista informada sem opção é recusada", !semOpcao.ok && semOpcao.code === "23514", quem(semOpcao));
    const semNada = await c.tentar("insert into public.kit_quantidades (produto_id, pessoas, grupo_id, total) values ($1, 70, $2, 5)", [p.ativo, bebida]);
    registrar("kit 56. linha sem opção nem lista (grupo existente) continua aceita", semNada.ok, quem(semNada));
    const grupoFalso = await c.tentar("insert into public.kit_quantidades (produto_id, pessoas, grupo_id, total) values ($1, 70, '00000000-0000-4000-8000-000000000000', 5)", [p.ativo]);
    registrar("kit 57. grupo que não existe é recusado", !grupoFalso.ok && grupoFalso.code === "23503", quem(grupoFalso));
  });

  // Posição repetida na lista: a unicidade é adiada até o fim da transação (permite
  // trocar posições de uma vez); aqui forçamos a conferência.
  await cenario(db, async (c) => {
    const p = await criarProdutos(c, categoria);
    const kit = await montarKit(c, p.ativo, "ZZPP");
    await c.como("authenticated");
    const dup = await c.tentar("insert into public.kit_lista_itens (lista_id, nome, posicao) values ($1, 'Outro', 1)", [kit.lista("Doces")]);
    const confere = await c.tentar("set constraints all immediate");
    registrar(
      "kit 18. posição repetida na lista é recusada (conferida ao fim da transação, adiada até lá)",
      dup.ok && !confere.ok && confere.code === "23505",
      `${descrever(dup)}; ${descrever(confere)}`
    );
  });

  // 3c. O que o editor de listas faz, sem função de banco (decisão do Cainan em
  // 21/10/2026): reordenar é UM upsert por id (insert ... on conflict (id) do
  // update) com todos os itens da lista, o que troca posições numa instrução só
  // porque a unicidade (lista_id, posicao) é adiada; renomear, ativar e desativar
  // são update por id; adicionar é insert com a próxima posição; o editor não
  // apaga item. Prova nas tabelas reais, como o logado.
  await cenario(db, async (c) => {
    const p = await criarProdutos(c, categoria);
    const kit = await montarKit(c, p.ativo, "ZZPE");
    await c.como("authenticated");
    const ordem = async (lista) =>
      (await c.q("select nome from public.kit_lista_itens where lista_id = $1 order by posicao", [lista])).rows.map((r) => r.nome).join("|");
    const upsertPosicoes = (lista, caso) =>
      c.tentar(
        `insert into public.kit_lista_itens (id, lista_id, nome, descricao, posicao, ativo)
         select id, lista_id, nome, descricao, ${caso}, ativo from public.kit_lista_itens where lista_id = $1
         on conflict (id) do update set posicao = excluded.posicao`,
        [lista]
      );

    // Troca de duas posições (lista Doces: Brigadeiro 1, Beijinho 2).
    const doces = kit.lista("Doces");
    const antes = await ordem(doces);
    const troca = await upsertPosicoes(doces, "case posicao when 1 then 2 when 2 then 1 end");
    const imediata = await c.tentar("set constraints all immediate");
    const depois = await ordem(doces);
    registrar(
      "kit 59. trocar duas posições é um upsert por id, aceito com a unicidade adiada e conferida no fim",
      troca.ok && imediata.ok && antes === "Brigadeiro|Beijinho" && depois === "Beijinho|Brigadeiro",
      `${antes} -> ${depois}; ${descrever(troca)}; conferência ao fim: ${descrever(imediata)}`
    );
    await c.q("set constraints all deferred");

    // Reordenação de três itens (lista Recheios: 1, 2, 3 passam a 2, 3, 1).
    const recheios = kit.lista("Recheios");
    const antes3 = await ordem(recheios);
    const gira = await upsertPosicoes(recheios, "case posicao when 1 then 2 when 2 then 3 when 3 then 1 end");
    const imediata3 = await c.tentar("set constraints all immediate");
    const depois3 = await ordem(recheios);
    registrar(
      "kit 60. reordenar três itens é um upsert por id, aceito",
      gira.ok && imediata3.ok && antes3 === "Morango com chocolate|Recheios com chocolate|Recheio escondido" && depois3 === "Recheio escondido|Morango com chocolate|Recheios com chocolate",
      `${antes3} -> ${depois3}; ${descrever(gira)}; conferência ao fim: ${descrever(imediata3)}`
    );
    await c.q("set constraints all deferred");

    // Cada chamada do supabase-js é uma transação própria, então a conferência
    // acontece ao fim de cada instrução (modo imediato). Num upsert só, a troca
    // passa (restrição deferrable confere no fim da instrução, não linha a linha);
    // com dois update separados, o primeiro já viola a unicidade.
    await c.q("set constraints public.kit_lista_itens_posicao_unica immediate");
    const umSo = await upsertPosicoes(doces, "case posicao when 1 then 2 when 2 then 1 end");
    const ordemUmSo = await ordem(doces);
    registrar(
      "kit 61. no modo imediato (uma chamada por transação), um upsert só ainda troca as posições",
      umSo.ok && ordemUmSo === "Brigadeiro|Beijinho",
      `${ordemUmSo}; ${descrever(umSo)}`
    );
    const doisUpdates = await c.tentar("update public.kit_lista_itens set posicao = 2 where lista_id = $1 and nome = 'Brigadeiro'", [doces]);
    registrar(
      "kit 64. no mesmo modo, dois update separados falham (23505) já no primeiro: por isso reordenar é um upsert só",
      !doisUpdates.ok && doisUpdates.code === "23505",
      descrever(doisUpdates)
    );
  });
  await cenario(db, async (c) => {
    const p = await criarProdutos(c, categoria);
    const kit = await montarKit(c, p.ativo, "ZZPF");
    await c.como("authenticated");
    // Item em uso por quantidade (Cini 2L, na lista Bebidas): desativar não dá erro e
    // as quantidades ficam; renomear também.
    const desativa = await c.tentar("update public.kit_lista_itens set ativo = false where id = $1", [kit.item("Cini 2L")]);
    const renomeia = await c.tentar("update public.kit_lista_itens set nome = 'Cini dois litros' where id = $1", [kit.item("Cini 2L")]);
    const restam = await c.q("select count(*)::int n from public.kit_quantidades where opcao_id = $1", [kit.item("Cini 2L")]);
    registrar(
      "kit 62. item em uso por quantidade desativa e renomeia sem erro, e as quantidades ficam",
      desativa.ok && desativa.rowCount === 1 && renomeia.ok && renomeia.rowCount === 1 && restam.rows[0].n === 2,
      `${descrever(desativa)}; ${descrever(renomeia)}; quantidades do item ${restam.rows[0].n}`
    );
    // Adicionar: insert com a próxima posição (maior mais um).
    const adiciona = await c.tentar(
      `insert into public.kit_lista_itens (lista_id, nome, posicao)
       select $1, 'Pêssego com doce de leite', coalesce(max(posicao), 0) + 1 from public.kit_lista_itens where lista_id = $1
       returning posicao`,
      [kit.lista("Recheios")]
    );
    registrar("kit 63. adicionar item na próxima posição", adiciona.ok && adiciona.rows[0].posicao === 4, descrever(adiciona));
  });

  // 4. Cascatas e restrição.
  await cenario(db, async (c) => {
    const p = await criarProdutos(c, categoria);
    const kit = await montarKit(c, p.ativo, "ZZPC");
    await c.q("delete from public.produtos where id = $1", [p.ativo]);
    const n = async (tabela) => (await c.q(`select count(*)::int n from public.${tabela} where produto_id = $1`, [p.ativo])).rows[0].n;
    const listas = await c.q("select count(*)::int n from public.kit_listas where nome like '% ZZPC'");
    registrar(
      "kit 36. excluir o produto leva grupos, tamanhos e quantidades; as listas ficam",
      (await n("kit_grupos")) === 0 && (await n("kit_tamanhos")) === 0 && (await n("kit_quantidades")) === 0 && listas.rows[0].n === 3,
      `listas que ficaram: ${listas.rows[0].n}`
    );
    void kit;
  });
  await cenario(db, async (c) => {
    const p = await criarProdutos(c, categoria);
    const kit = await montarKit(c, p.ativo, "ZZPD");
    const apagaLista = await c.tentar("delete from public.kit_listas where id = $1", [kit.lista("Doces")]);
    registrar("kit 37. lista em uso por um grupo não pode ser apagada", !apagaLista.ok && apagaLista.code === "23503", descrever(apagaLista));
    // Item usado por uma quantidade não pode ser apagado (RESTRICT): o admin
    // desativa. Item que ninguém usa pode.
    const apagaItem = await c.tentar("delete from public.kit_lista_itens where id = $1", [kit.item("Cini 2L")]);
    const restamItem = await c.q("select count(*)::int n from public.kit_quantidades where produto_id = $1", [p.ativo]);
    const itemFicou = await c.q("select count(*)::int n from public.kit_lista_itens where id = $1", [kit.item("Cini 2L")]);
    registrar(
      "kit 38. item de lista usado por uma quantidade não pode ser apagado (RESTRICT) e nada some",
      !apagaItem.ok && apagaItem.code === "23503" && /kit_quantidades_opcao_fkey/.test(apagaItem.message) && restamItem.rows[0].n === 6 && itemFicou.rows[0].n === 1,
      `${descrever(apagaItem)}; quantidades ${restamItem.rows[0].n}, item ${itemFicou.rows[0].n}`
    );
    const apagaLivre = await c.tentar("delete from public.kit_lista_itens where lista_id = $1 and nome = 'Recheio escondido'", [kit.lista("Recheios")]);
    registrar("kit 50. item que nenhuma quantidade usa pode ser apagado", apagaLivre.ok && apagaLivre.rowCount === 1, descrever(apagaLivre));

    // Apagar o grupo leva as quantidades dele (CASCADE), com ou sem opção, e não
    // leva a lista nem os itens.
    const apagaGrupo = await c.tentar("delete from public.kit_grupos where produto_id = $1 and chave = 'doces'", [p.ativo]);
    const restam2 = await c.q("select count(*)::int n from public.kit_quantidades where produto_id = $1", [p.ativo]);
    registrar("kit 39. apagar um grupo sem opção leva as quantidades dele (2 saem, 4 ficam)", apagaGrupo.ok && restam2.rows[0].n === 4, `${descrever(apagaGrupo)}; restam ${restam2.rows[0].n}`);
    const apagaBebida = await c.tentar("delete from public.kit_grupos where produto_id = $1 and chave = 'bebida'", [p.ativo]);
    const restam3 = await c.q("select count(*)::int n from public.kit_quantidades where produto_id = $1", [p.ativo]);
    const preservados = await c.q(
      "select (select count(*)::int from public.kit_lista_itens where lista_id = $1) itens, (select count(*)::int from public.kit_listas where id = $1) listas",
      [kit.lista("Bebidas")]
    );
    registrar(
      "kit 49. apagar um grupo cujas quantidades têm opção leva essas quantidades (4 saem, 0 ficam); a lista e os itens ficam",
      apagaBebida.ok && apagaBebida.rowCount === 1 && restam3.rows[0].n === 0 && preservados.rows[0].itens === 2 && preservados.rows[0].listas === 1,
      `${descrever(apagaBebida)}; quantidades restantes ${restam3.rows[0].n}; itens da lista ${preservados.rows[0].itens}; lista ${preservados.rows[0].listas}`
    );
  });

  // O teste 49 sozinho não distingue CASCADE de NO ACTION na chave nova (a chave
  // antiga já apaga as linhas antes da conferência); o comportamento declarado de
  // cada chave de kit_quantidades é lido do catálogo.
  {
    const { rows } = await db.query(
      `select conname, confdeltype::text tipo from pg_constraint
       where conrelid = 'public.kit_quantidades'::regclass and contype = 'f' order by conname`
    );
    const esperado = {
      kit_quantidades_grupo_fkey: "c",
      kit_quantidades_grupo_lista_fkey: "c",
      kit_quantidades_opcao_fkey: "r",
      kit_quantidades_tamanho_fkey: "c",
    };
    const lido = Object.fromEntries(rows.map((r) => [r.conname, r.tipo]));
    registrar(
      "kit 58. chaves de kit_quantidades: grupo, grupo+lista e tamanho em CASCADE; opção em RESTRICT",
      Object.entries(esperado).every(([k, v]) => lido[k] === v) && rows.length === 4,
      rows.map((r) => `${r.conname}=${r.tipo}`).join(" ")
    );
  }

  // 5. RLS ligada em todas e nenhuma função nova no PR.
  {
    const { rows } = await db.query(
      `select relname, relrowsecurity from pg_class
       where relnamespace = 'public'::regnamespace and relname in ('kit_listas','kit_lista_itens','kit_grupos','kit_tamanhos','kit_quantidades') order by 1`
    );
    registrar("kit 40. as cinco tabelas têm RLS ligada", rows.length === 5 && rows.every((r) => r.relrowsecurity), rows.map((r) => `${r.relname}:${r.relrowsecurity}`).join(" "));
  }

  // 6. Enum: valor novo no fim da ordem; produto aceita o tipo.
  await cenario(db, async (c) => {
    const { rows: ordem } = await c.q(
      `select string_agg(e.enumlabel, ',' order by e.enumsortorder) tipos from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'produto_tipo'`
    );
    const tipos = ordem[0].tipos.split(",");
    registrar(
      "kit 41. produto_tipo ganhou kit_pessoa no fim; os quatro de antes seguem",
      tipos.length === 5 && tipos[4] === "kit_pessoa" && ["normal", "cento", "bolo", "bento_cake"].every((t) => tipos.includes(t)),
      tipos.join(", ")
    );
    const nova = await c.tentar(
      `insert into public.produtos (nome, preco, pedido_minimo, tipo, "Categoria", ativo, unidade_venda)
       values ('PROVA_KIT_PESSOA', 22, 10, 'kit_pessoa', $1, true, 'a pessoa') returning nome`,
      [categoria]
    );
    if (!nova.ok && nova.code === "55P04") {
      pular(
        "kit 42 e 43. produto com o tipo kit_pessoa em Kit Festa e leitura anônima dele",
        "o valor novo do enum foi criado nesta mesma transação (55P04); roda de verdade depois de aplicado"
      );
      return;
    }
    registrar("kit 42. produtos aceita o tipo kit_pessoa em Kit Festa", nova.ok && nova.rowCount === 1, descrever(nova));
    await c.como("anon");
    const anon = await c.tentar("select nome from public.produtos where nome = 'PROVA_KIT_PESSOA'");
    registrar("kit 43. anônimo lê o produto kit_pessoa ativo (RLS de ativo segue igual)", anon.ok && anon.rows.length === 1, descrever(anon));
  });
});
