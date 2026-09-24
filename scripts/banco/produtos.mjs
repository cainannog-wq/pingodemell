// RLS e permissões de "produtos" e "produto_fotos" (galeria), numa
// transação desfeita — nada é gravado. Substitui scripts/test-rls.mjs e
// scripts/test-rls-fotos.mjs, que criavam sessão de verdade no Auth.
//
// Os produtos e fotos usados aqui são criados dentro da própria transação
// (um ativo e um inativo, com fotos), então o teste não depende dos
// produtos fictícios que existem hoje no banco.
//
// Uso: node scripts/banco/produtos.mjs [--com-migracao]

import { cenario, descrever, emTransacaoDesfeita, registrar } from "./lib.mjs";

const ATIVO = "PROVA_TRANSACAO_ATIVO";
const INATIVO = "PROVA_TRANSACAO_INATIVO";

// Cria os dois produtos de prova, cada um com 2 fotos extras. Roda como
// dono, dentro do cenário (desfeito no fim dele). atualizado_em nasce
// antigo porque, dentro de uma transação, now() não anda — assim o gatilho
// de update tem o que mudar.
async function criarProdutosDeProva(c) {
  const { rows } = await c.q(
    `insert into public.produtos (nome, preco, pedido_minimo, tipo, ativo, atualizado_em)
     values ($1, 1, 1, 'normal', true, '2000-01-01'), ($2, 1, 1, 'normal', false, '2000-01-01')
     returning nome, id`,
    [ATIVO, INATIVO]
  );
  const ids = Object.fromEntries(rows.map((r) => [r.nome, r.id]));
  for (const id of Object.values(ids)) {
    await c.q(
      `insert into public.produto_fotos (produto_id, caminho, posicao)
       select $1::uuid, 'galeria/' || $1 || '/' || gen_random_uuid() || '.webp', p
       from generate_series(1, 2) p`,
      [id]
    );
  }
  return { idAtivo: ids[ATIVO], idInativo: ids[INATIVO] };
}

await emTransacaoDesfeita("Produtos e galeria — RLS e permissões", async (db) => {
  // --- produtos: anônimo ---------------------------------------------
  await cenario(db, async (c) => {
    const { idInativo } = await criarProdutosDeProva(c);
    const { rows: ref } = await c.q("select count(*)::int total, count(*) filter (where ativo)::int ativos from public.produtos");

    await c.como("anon");
    const todos = await c.tentar("select nome, ativo from public.produtos");
    registrar(
      "produtos 1. anônimo lê produtos",
      todos.ok && todos.rowCount > 0,
      descrever(todos)
    );
    registrar(
      "produtos 4. anônimo lê produto ativo, e só ativo",
      todos.ok && todos.rowCount === ref[0].ativos && todos.rows.every((p) => p.ativo === true) && todos.rows.some((p) => p.nome === ATIVO),
      `anônimo leu ${todos.rowCount}; ativos no banco: ${ref[0].ativos} (de ${ref[0].total})`
    );
    const filtrando = await c.tentar("select nome from public.produtos where ativo = false");
    registrar("produtos 5. anônimo filtrando por inativo não recebe nada", filtrando.ok && filtrando.rowCount === 0, descrever(filtrando));
    const peloId = await c.tentar("select nome from public.produtos where id = $1", [idInativo]);
    registrar("produtos 6. anônimo buscando um inativo pelo id não recebe nada", peloId.ok && peloId.rowCount === 0, descrever(peloId));

    const ins = await c.tentar("insert into public.produtos (nome, preco, pedido_minimo) values ('PROVA_ANON_INSERE', 1, 1)");
    registrar("produtos 2. anônimo não insere produto", !ins.ok, descrever(ins));
    const upd = await c.tentar("update public.produtos set preco = 0 where nome = $1", [ATIVO]);
    const del = await c.tentar("delete from public.produtos where nome = $1", [ATIVO]);
    await c.dono();
    const { rows: depois } = await c.q("select preco::float from public.produtos where nome = $1", [ATIVO]);
    registrar(
      "produtos 3. anônimo não altera nem apaga produto",
      depois.length === 1 && depois[0].preco === 1 && (!upd.ok || upd.rowCount === 0) && (!del.ok || del.rowCount === 0),
      `update ${descrever(upd)}; delete ${descrever(del)}; produto continua com preço ${depois[0]?.preco}`
    );
  });

  // --- produtos: logado (admin) --------------------------------------
  await cenario(db, async (c) => {
    await criarProdutosDeProva(c);
    const { rows: ref } = await c.q("select count(*)::int total from public.produtos");
    const { rows: antes } = await c.q("select atualizado_em from public.produtos where nome = $1", [ATIVO]);

    await c.como("authenticated");
    const todos = await c.tentar("select nome, ativo from public.produtos");
    registrar(
      "produtos 7. logado lê todos, ativos e inativos",
      todos.ok && todos.rowCount === ref[0].total && todos.rows.some((p) => p.nome === INATIVO),
      `logado leu ${todos.rowCount} de ${ref[0].total}`
    );
    const ins = await c.tentar("insert into public.produtos (nome, preco, pedido_minimo) values ('PROVA_ADMIN_INSERE', 2, 1)");
    const upd = await c.tentar("update public.produtos set descricao = 'alterado na prova' where nome = $1", [ATIVO]);
    const del = await c.tentar("delete from public.produtos where nome = 'PROVA_ADMIN_INSERE'");
    registrar(
      "produtos 8. logado insere, altera e apaga produto",
      ins.ok && ins.rowCount === 1 && upd.ok && upd.rowCount === 1 && del.ok && del.rowCount === 1,
      `insert ${descrever(ins)}; update ${descrever(upd)}; delete ${descrever(del)}`
    );
    await c.dono();
    const { rows: depois } = await c.q("select atualizado_em from public.produtos where nome = $1", [ATIVO]);
    registrar(
      "produtos 9. gatilho produtos_set_atualizado_em dispara no update do logado",
      depois[0].atualizado_em.getTime() !== antes[0].atualizado_em.getTime(),
      `atualizado_em ${antes[0].atualizado_em.toISOString()} -> ${depois[0].atualizado_em.toISOString()}`
    );
  });

  // --- produto_fotos: leitura ----------------------------------------
  await cenario(db, async (c) => {
    const { idAtivo, idInativo } = await criarProdutosDeProva(c);
    const contar = async (id) => (await c.tentar("select id from public.produto_fotos where produto_id = $1", [id])).rowCount;

    await c.como("anon");
    const anonAtivo = await contar(idAtivo);
    const anonInativo = await contar(idInativo);
    const tudo = await c.tentar("select produto_id from public.produto_fotos");
    await c.dono();
    await c.como("authenticated");
    const logadoAtivo = await contar(idAtivo);
    const logadoInativo = await contar(idInativo);

    registrar("fotos 1. anônimo lê as fotos do produto ativo", anonAtivo === 2, `anônimo leu ${anonAtivo} de 2`);
    registrar("fotos 2. logado lê o mesmo número de fotos do ativo que o anônimo", logadoAtivo === anonAtivo, `logado ${logadoAtivo}, anônimo ${anonAtivo}`);
    registrar("fotos 3. logado lê as fotos do produto inativo", logadoInativo === 2, `logado leu ${logadoInativo} de 2`);
    registrar("fotos 4. anônimo lê zero fotos do inativo, filtrando pelo id do produto", anonInativo === 0, `anônimo leu ${anonInativo}`);
    const vazadas = (tudo.rows ?? []).filter((l) => l.produto_id === idInativo).length;
    registrar("fotos 5. anônimo lendo a tabela inteira não recebe foto do inativo", tudo.ok && vazadas === 0, `${tudo.rowCount} linha(s), ${vazadas} do inativo`);
  });

  // --- produto_fotos: escrita, função e gatilho ----------------------
  await cenario(db, async (c) => {
    const { idAtivo } = await criarProdutosDeProva(c);
    const novaFoto = `insert into public.produto_fotos (produto_id, caminho, posicao)
      values ($1::uuid, 'galeria/' || $1 || '/' || gen_random_uuid() || '.webp', $2)`;

    await c.como("anon");
    const anonIns = await c.tentar(novaFoto, [idAtivo, 3]);
    const anonFn = await c.tentar("select public.salvar_produto_fotos($1, '[]'::jsonb)", [idAtivo]);
    registrar("fotos 6. anônimo não insere foto nem chama salvar_produto_fotos", !anonIns.ok && !anonFn.ok, `insert ${descrever(anonIns)}; função ${descrever(anonFn)}`);

    await c.dono();
    await c.como("authenticated");
    const inseridas = [];
    for (let posicao = 3; posicao <= 9; posicao++) inseridas.push(await c.tentar(novaFoto, [idAtivo, posicao]));
    const decima = await c.tentar(novaFoto, [idAtivo, 9]);
    registrar(
      "fotos 7. logado insere até 9 fotos e o gatilho produto_fotos_limite barra a 10ª",
      inseridas.every((r) => r.ok) && !decima.ok && /Limite de 9/.test(decima.message),
      `7 inserções ${inseridas.every((r) => r.ok) ? "aceitas" : "com falha"}; 10ª ${descrever(decima)}`
    );
  });

  await cenario(db, async (c) => {
    const { idAtivo } = await criarProdutosDeProva(c);
    const { rows } = await c.q("select id from public.produto_fotos where produto_id = $1 order by posicao", [idAtivo]);
    await c.como("authenticated");
    const salvar = await c.tentar("select public.salvar_produto_fotos($1, $2::jsonb) as removidos", [
      idAtivo,
      JSON.stringify([{ id: rows[1].id }]),
    ]);
    const { rows: ficaram } = await c.q("select posicao from public.produto_fotos where produto_id = $1", [idAtivo]);
    registrar(
      "fotos 8. logado grava a galeria com salvar_produto_fotos (remove 1, reposiciona 1)",
      salvar.ok && salvar.rows[0].removidos.length === 1 && ficaram.length === 1 && ficaram[0].posicao === 1,
      `${descrever(salvar)}; ficaram posições ${ficaram.map((f) => f.posicao).join(",")}`
    );
  });
});
