// RLS e permissões de "produto_cento_itens" (sabores de um produto tipo
// Cento), numa transação desfeita — nada é gravado. Substitui
// scripts/test-rls-produto-cento-itens.mjs, que criava produtos e itens
// temporários em produção.
//
// Uso: node scripts/banco/produto-cento-itens.mjs [--com-migracao]

import { cenario, descrever, emTransacaoDesfeita, registrar } from "./lib.mjs";

const CENTO = "PROVA_TRANSACAO_CENTO";
const SABOR = "PROVA_TRANSACAO_SABOR";

async function criarProdutosDeProva(c) {
  await c.q(
    "insert into public.produtos (nome, preco, pedido_minimo, tipo) values ($1, 1, 1, 'cento'), ($2, 1, 1, 'normal')",
    [CENTO, SABOR]
  );
}

await emTransacaoDesfeita("Itens de Cento — RLS e permissões", async (db) => {
  await cenario(db, async (c) => {
    await criarProdutosDeProva(c);
    await c.q("insert into public.produto_cento_itens (cento_nome, subitem_nome, ordem) values ($1, $2, 0)", [CENTO, SABOR]);
    await c.como("anon");
    const le = await c.tentar("select id from public.produto_cento_itens");
    const altera = await c.tentar("update public.produto_cento_itens set ordem = 9 where cento_nome = $1", [CENTO]);
    const apaga = await c.tentar("delete from public.produto_cento_itens where cento_nome = $1", [CENTO]);
    await c.dono();
    const { rows } = await c.q("select ordem from public.produto_cento_itens where cento_nome = $1", [CENTO]);
    registrar("cento 1. anônimo lê (leitura pública)", le.ok && le.rowCount > 0, descrever(le));
    registrar("cento 3. anônimo não apaga", (!apaga.ok || apaga.rowCount === 0) && rows.length === 1, `${descrever(apaga)}; item continua`);
    registrar("cento 7. anônimo não altera", (!altera.ok || altera.rowCount === 0) && rows[0]?.ordem === 0, `${descrever(altera)}; ordem continua ${rows[0]?.ordem}`);
  });

  await cenario(db, async (c) => {
    await criarProdutosDeProva(c);
    await c.como("anon");
    const insere = await c.tentar("insert into public.produto_cento_itens (cento_nome, subitem_nome, ordem) values ($1, $2, 0)", [CENTO, SABOR]);
    registrar("cento 2. anônimo não insere", !insere.ok, descrever(insere));
  });

  await cenario(db, async (c) => {
    await criarProdutosDeProva(c);
    await c.como("authenticated");
    const insere = await c.tentar("insert into public.produto_cento_itens (cento_nome, subitem_nome, ordem) values ($1, $2, 0) returning id", [CENTO, SABOR]);
    const le = await c.tentar("select subitem_nome from public.produto_cento_itens where cento_nome = $1", [CENTO]);
    const altera = await c.tentar("update public.produto_cento_itens set ordem = 1 where cento_nome = $1", [CENTO]);
    const apaga = await c.tentar("delete from public.produto_cento_itens where cento_nome = $1", [CENTO]);
    registrar("cento 4. logado insere", insere.ok && insere.rowCount === 1, descrever(insere));
    registrar("cento 5. logado lê o item inserido", le.ok && le.rows[0]?.subitem_nome === SABOR, le.ok ? `sabor: ${le.rows[0]?.subitem_nome}` : descrever(le));
    registrar("cento 8. logado altera a ordem", altera.ok && altera.rowCount === 1, descrever(altera));
    registrar("cento 6. logado apaga", apaga.ok && apaga.rowCount === 1, descrever(apaga));
  });
});
