// Coluna produtos.unidade_venda e categoria "Kits" (PR 2d), numa transação
// desfeita — nada é gravado. Os produtos usados aqui são criados dentro da
// própria transação.
//
// "Kits" só é testado se o valor já existir no enum categoria_produto: o
// Postgres não deixa usar um valor novo na mesma transação em que ele foi
// criado, então com --com-migracao=supabase/categoria-kits.sql a parte de
// Kits fica de fora (aviso, não falha).
//
// Uso: node scripts/banco/unidade-venda-kits.mjs [--com-migracao=<arquivo.sql>]

import { cenario, descrever, emTransacaoDesfeita, registrar } from "./lib.mjs";

const PROVA = "PROVA_TRANSACAO_UNIDADE";
const GATILHOS = "produtos_set_atualizado_em,produtos_slug_imutavel,produtos_slug_no_cadastro";

await emTransacaoDesfeita("Unidade de venda e categoria Kits", async (db) => {
  // --- coluna ------------------------------------------------------------
  await cenario(db, async (c) => {
    const { rows } = await c.q(
      `select data_type, is_nullable, column_default
       from information_schema.columns
       where table_schema = 'public' and table_name = 'produtos' and column_name = 'unidade_venda'`
    );
    const col = rows[0];
    registrar(
      "unidade 1. coluna unidade_venda existe: texto, aceita nulo, sem default",
      !!col && col.data_type === "text" && col.is_nullable === "YES" && col.column_default === null,
      col ? `${col.data_type}, nulo: ${col.is_nullable}, default: ${col.column_default}` : "coluna não existe"
    );
    const { rows: gatilhos } = await c.q(
      "select tgname from pg_trigger where tgrelid = 'public.produtos'::regclass and not tgisinternal order by tgname"
    );
    const nomes = gatilhos.map((g) => g.tgname).join(",");
    registrar("unidade 2. nenhum gatilho novo em produtos", nomes === GATILHOS, nomes);
  });

  // --- logado grava; anônimo lê --------------------------------------------
  await cenario(db, async (c) => {
    await c.q(
      `insert into public.produtos (nome, preco, pedido_minimo, tipo, ativo, "Categoria")
       values ($1, 90, 1, 'normal', true, 'Bolos')`,
      [PROVA]
    );
    await c.como("authenticated");
    const aceitos = [];
    for (const valor of ["kg", "caixa com 6", null]) {
      const r = await c.tentar("update public.produtos set unidade_venda = $2 where nome = $1", [PROVA, valor]);
      aceitos.push({ valor, r });
    }
    registrar(
      "unidade 3. logado grava kg, texto livre e vazio (nulo)",
      aceitos.every(({ r }) => r.ok && r.rowCount === 1),
      aceitos.map(({ valor, r }) => `${JSON.stringify(valor)}: ${descrever(r)}`).join("; ")
    );

    const recusados = [];
    for (const valor of ["", "   ", " kg", "x".repeat(21)]) {
      const r = await c.tentar("update public.produtos set unidade_venda = $2 where nome = $1", [PROVA, valor]);
      recusados.push({ valor, r });
    }
    registrar(
      "unidade 4. banco recusa texto vazio, com espaço sobrando ou acima de 20 caracteres",
      recusados.every(({ r }) => !r.ok && r.code === "23514"),
      recusados.map(({ valor, r }) => `${JSON.stringify(valor)}: ${descrever(r)}`).join("; ")
    );

    await c.dono();
    await c.q("update public.produtos set unidade_venda = 'kg' where nome = $1", [PROVA]);
    await c.como("anon");
    const lido = await c.tentar("select unidade_venda from public.produtos where nome = $1", [PROVA]);
    registrar(
      "unidade 5. anônimo lê a unidade de venda de produto ativo (o card do site)",
      lido.ok && lido.rows[0]?.unidade_venda === "kg",
      descrever(lido)
    );
  });

  // --- Kits -----------------------------------------------------------------
  await cenario(db, async (c) => {
    const lido = await c.tentar("select enum_range(null::public.categoria_produto)::text[] as valores");
    if (!lido.ok && lido.code === "55P04") {
      console.log("\n[AVISO] Um valor novo do enum foi criado nesta mesma transação (--com-migracao): parte de Kits não testada.");
      return;
    }
    const valores = lido.rows[0].valores;
    if (!valores.includes("Kits")) {
      console.log(`\n[AVISO] Kits ainda não está no enum (${valores.join(", ")}): parte de Kits não testada.`);
      return;
    }
    registrar(
      "kits 1. enum categoria_produto mantém os 5 valores de antes (Bento Cake veio depois, ver recheios.mjs)",
      ["Bolos", "Doces", "Salgados", "Bebidas", "Kits"].every((v) => valores.includes(v)),
      valores.join(", ")
    );
    await c.como("authenticated");
    const ins = await c.tentar(
      `insert into public.produtos (nome, preco, pedido_minimo, tipo, ativo, "Categoria") values ($1, 1, 1, 'normal', true, 'Kits')`,
      [`${PROVA}_KITS`]
    );
    await c.como("anon");
    const filtro = await c.tentar(`select nome from public.produtos where "Categoria" = 'Kits' and nome = $1`, [`${PROVA}_KITS`]);
    registrar(
      "kits 2. logado cadastra produto em Kits; anônimo encontra pelo filtro de categoria",
      ins.ok && ins.rowCount === 1 && filtro.ok && filtro.rowCount === 1,
      `insert ${descrever(ins)}; filtro ${descrever(filtro)}`
    );
  });
});
