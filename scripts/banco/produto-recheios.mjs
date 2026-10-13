// Recheios personalizados por produto (supabase/produto-recheios.sql), numa
// transação desfeita — nada é gravado. Prova: RLS (anônimo lê só recheio de
// produto ativo e não escreve; logado escreve), a função de salvar (ordem,
// troca, lista vazia, repetido), as restrições e a cópia do Bento Cake.
//
// A prova da cópia só roda com a migração dentro da transação
// (--com-migracao=supabase/produto-recheios.sql) ou depois de aplicada; sem a
// tabela, o script para com aviso.
//
// Uso: node scripts/banco/produto-recheios.mjs [--com-migracao=<arquivo.sql>]

import { cenario, descrever, emTransacaoDesfeita, pular, registrar } from "./lib.mjs";

const ATIVO = "PROVA_TRANSACAO_BOLO_ATIVO";
const INATIVO = "PROVA_TRANSACAO_BOLO_INATIVO";

async function criarProdutos(c) {
  const { rows } = await c.q(
    `insert into public.produtos (nome, preco, pedido_minimo, tipo, "Categoria", ativo)
     values ($1, 100, 1, 'normal', 'Bolos', true), ($2, 100, 1, 'normal', 'Bolos', false)
     returning id, nome`,
    [ATIVO, INATIVO]
  );
  const id = (nome) => rows.find((r) => r.nome === nome).id;
  return { ativo: id(ATIVO), inativo: id(INATIVO) };
}

await emTransacaoDesfeita("Recheios personalizados por produto", async (db) => {
  const existe = await db.query("select to_regclass('public.produto_recheios') as t");
  if (!existe.rows[0].t) {
    pular("recheios do produto (todos)", "a tabela produto_recheios não existe; use --com-migracao=supabase/produto-recheios.sql");
    return;
  }

  // Leitura pública só de produto ativo; escrita só do logado.
  await cenario(db, async (c) => {
    const p = await criarProdutos(c);
    await c.q("insert into public.produto_recheios (produto_id, nome, posicao) values ($1, 'A', 1), ($2, 'B', 1)", [p.ativo, p.inativo]);
    await c.como("anon");
    const le = await c.tentar("select p.nome from public.produto_recheios r join public.produtos p on p.id = r.produto_id where p.nome like 'PROVA_TRANSACAO_%'");
    const direto = await c.tentar("select nome from public.produto_recheios where produto_id in ($1, $2)", [p.ativo, p.inativo]);
    registrar("recheios 1. anônimo lê só o recheio de produto ativo", direto.ok && direto.rows.length === 1 && direto.rows[0].nome === "A", descrever(direto));
    registrar("recheios 2. anônimo continua sem ver o produto inativo", le.ok, descrever(le));
    const insere = await c.tentar("insert into public.produto_recheios (produto_id, nome, posicao) values ($1, 'C', 2)", [p.ativo]);
    const altera = await c.tentar("update public.produto_recheios set nome = 'X' where produto_id = $1", [p.ativo]);
    const apaga = await c.tentar("delete from public.produto_recheios where produto_id = $1", [p.ativo]);
    const trunca = await c.tentar("truncate public.produto_recheios");
    const salva = await c.tentar("select public.salvar_produto_recheios($1, '[{\"nome\":\"Z\"}]'::jsonb)", [p.ativo]);
    await c.dono();
    const { rows } = await c.q("select nome from public.produto_recheios where produto_id = $1", [p.ativo]);
    registrar("recheios 3. anônimo não insere", !insere.ok, descrever(insere));
    registrar("recheios 4. anônimo não altera nem apaga", (!altera.ok || altera.rowCount === 0) && (!apaga.ok || apaga.rowCount === 0) && rows.length === 1 && rows[0].nome === "A", `${descrever(altera)}; ${descrever(apaga)}`);
    registrar("recheios 5. anônimo não trunca nem chama a função de salvar", !trunca.ok && !salva.ok, `${descrever(trunca)}; ${descrever(salva)}`);
  });

  await cenario(db, async (c) => {
    const p = await criarProdutos(c);
    await c.como("authenticated");
    const lista = JSON.stringify([{ nome: "Brigadeiro" }, { nome: "Ninho com morango" }, { nome: "Doce de leite" }]);
    const salva = await c.tentar("select public.salvar_produto_recheios($1, $2::jsonb)", [p.ativo, lista]);
    const le = await c.tentar("select id, nome, posicao from public.produto_recheios where produto_id = $1 order by posicao", [p.ativo]);
    registrar("recheios 6. logado salva a lista na ordem recebida", salva.ok && le.ok && le.rows.map((r) => r.nome).join("|") === "Brigadeiro|Ninho com morango|Doce de leite" && le.rows.map((r) => r.posicao).join() === "1,2,3", le.ok ? le.rows.map((r) => r.nome).join("|") : descrever(le));

    // Reordenar mantendo os ids, trocar um, tirar um.
    const [a, b] = le.rows;
    const nova = JSON.stringify([{ id: b.id, nome: b.nome }, { id: a.id, nome: a.nome }, { nome: "Novo" }]);
    const troca = await c.tentar("select public.salvar_produto_recheios($1, $2::jsonb)", [p.ativo, nova]);
    const le2 = await c.tentar("select id, nome from public.produto_recheios where produto_id = $1 order by posicao", [p.ativo]);
    registrar(
      "recheios 7. reordenar mantém o id de quem ficou; quem saiu some",
      troca.ok && le2.ok && le2.rows.length === 3 && le2.rows[0].id === b.id && le2.rows[1].id === a.id && le2.rows[2].nome === "Novo",
      le2.ok ? le2.rows.map((r) => r.nome).join("|") : descrever(le2)
    );

    const vazia = await c.tentar("select public.salvar_produto_recheios($1, '[]'::jsonb)", [p.ativo]);
    const le3 = await c.tentar("select count(*)::int n from public.produto_recheios where produto_id = $1", [p.ativo]);
    registrar("recheios 8. lista vazia desliga (apaga tudo)", vazia.ok && le3.rows[0].n === 0, descrever(vazia));

    const repetido = await c.tentar("select public.salvar_produto_recheios($1, '[{\"nome\":\"Doce\"},{\"nome\":\"doce\"}]'::jsonb)", [p.ativo]);
    registrar("recheios 9. repetido (sem diferenciar maiúscula) é recusado pelo banco", !repetido.ok, descrever(repetido));
    const emBranco = await c.tentar("select public.salvar_produto_recheios($1, '[{\"nome\":\"  \"}]'::jsonb)", [p.ativo]);
    registrar("recheios 10. nome em branco é recusado pelo banco", !emBranco.ok, descrever(emBranco));
    const naoLista = await c.tentar("select public.salvar_produto_recheios($1, '{}'::jsonb)", [p.ativo]);
    registrar("recheios 11. corpo que não é lista é recusado", !naoLista.ok, descrever(naoLista));
  });

  await cenario(db, async (c) => {
    const p = await criarProdutos(c);
    await c.q("insert into public.produto_recheios (produto_id, nome, posicao) values ($1, 'A', 1)", [p.ativo]);
    await c.q("delete from public.produtos where id = $1", [p.ativo]);
    const { rows } = await c.q("select count(*)::int n from public.produto_recheios where produto_id = $1", [p.ativo]);
    registrar("recheios 12. excluir o produto leva os recheios junto", rows[0].n === 0, `restaram ${rows[0].n}`);
  });

  // Cópia do Bento Cake: a lista nova é a lista que o catálogo dava ao Bento.
  // Só confere quando a cópia já rodou (a migração está na transação ou no
  // banco) e nenhum Bento mudou depois (no banco real, depois que o admin
  // editar a lista de um Bento, a igualdade deixa de valer de propósito).
  const catalogo = await db.query(
    "select nome from public.recheios where ativo = true and vale_bento = true order by lower(nome), nome"
  );
  const bentos = await db.query("select id, nome from public.produtos where tipo = 'bento_cake' order by nome");
  if (bentos.rows.length === 0) {
    pular("recheios 13. cópia do Bento Cake", "não há produto de Bento Cake");
  } else {
    const esperado = catalogo.rows.map((r) => r.nome).join("|");
    const divergentes = [];
    for (const b of bentos.rows) {
      const { rows } = await db.query("select nome from public.produto_recheios where produto_id = $1 order by posicao", [b.id]);
      if (rows.map((r) => r.nome).join("|") !== esperado) divergentes.push(b.nome);
    }
    registrar(
      "recheios 13. cada Bento Cake tem a mesma lista que o catálogo dava (ordem alfabética)",
      divergentes.length === 0,
      divergentes.length ? `diferentes: ${divergentes.join("; ")}` : `${bentos.rows.length} produtos x ${catalogo.rows.length} recheios`
    );
  }
});
