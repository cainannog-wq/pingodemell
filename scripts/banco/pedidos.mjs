// Gravação e RLS de "pedidos", numa transação desfeita — nada é gravado.
// Substitui scripts/test-rls-pedidos.mjs e scripts/test-mass-assignment-pedidos.mjs,
// que gravavam pedidos de verdade em produção.
//
// Regra desde o PR seguranca-api: a cliente continua pedindo sem login, mas
// o pedido só é gravado pelo servidor (POST /api/pedidos, com validação,
// limite por IP e a chave de serviço). Nenhum papel da API (anon,
// authenticated) grava direto em pedidos.
//
// Cuidado com o contador de número de pedido: um INSERT que chega a rodar
// gasta um número mesmo desfeito. Por isso:
//   - o anônimo/logado só TENTA inserir na tabela real quando o catálogo
//     confirma que ele não tem a permissão (a recusa vem antes do contador);
//   - a gravação do servidor é provada numa cópia da tabela criada dentro
//     da transação, com contador próprio;
//   - o pedido usado pelo logado entra com número explícito (-1), sem usar
//     o contador.
//
// Uso: node scripts/banco/pedidos.mjs [--com-migracao]

import { cenario, descrever, emTransacaoDesfeita, registrar, SEM_PERMISSAO } from "./lib.mjs";

// Mesmo formato que src/app/api/pedidos/route.ts monta antes de gravar.
function pedidoDoServidor(sobrescrever = {}) {
  return {
    cliente_nome: "PROVA_TRANSACAO_DESFEITA",
    cliente_whatsapp: "(41) 90000-0000",
    cliente_email: null,
    ocasiao: null,
    modo_entrega: "retirada",
    endereco: null,
    data_hora_entrega: new Date(Date.now() + 2 * 86400000).toISOString(),
    forma_pagamento: "PIX",
    observacoes: null,
    itens: [{ nome: "Bolo caro", variacao: null, quantidade: 1, preco_unitario: 500 }],
    subtotal: 500,
    valor_entrega: 0,
    total: 500,
    ...sobrescrever,
  };
}

// Insert com colunas explícitas (as do payload), como o PostgREST faz.
function insertDoPayload(tabela, payload) {
  const colunas = Object.keys(payload);
  return {
    sql: `insert into ${tabela} (${colunas.join(", ")})
      select ${colunas.join(", ")} from jsonb_populate_record(null::${tabela}, $1::jsonb)
      returning id, numero, status, subtotal::float, total::float, criado_em`,
    args: [JSON.stringify(payload)],
  };
}

await emTransacaoDesfeita("Pedidos — gravação só pelo servidor, RLS e gatilhos", async (db) => {
  // --- anônimo e logado não gravam direto ----------------------------
  for (const papel of ["anon", "authenticated"]) {
    await cenario(db, async (c) => {
      const { rows } = await c.q(
        `select has_table_privilege($1, 'public.pedidos', 'INSERT') tabela,
                has_any_column_privilege($1, 'public.pedidos', 'INSERT') alguma_coluna,
                has_sequence_privilege($1, 'public.pedidos_numero_seq', 'USAGE') contador,
                (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'pedidos' and cmd in ('INSERT', 'ALL')) politicas_insert`,
        [papel]
      );
      const p = rows[0];
      const semPermissao = !p.tabela && !p.alguma_coluna;
      let tentativa = null;
      if (semPermissao) {
        // Seguro: sem permissão, a recusa vem antes de o contador andar.
        await c.como(papel);
        const { sql, args } = insertDoPayload("public.pedidos", pedidoDoServidor({ status: "entregue" }));
        tentativa = await c.tentar(sql, args);
      }
      const nome = papel === "anon" ? "anônimo" : "logado";
      registrar(
        `pedidos 1. ${nome} NÃO grava direto em pedidos (só o servidor grava)`,
        semPermissao && !p.contador && p.politicas_insert === 0 && tentativa && !tentativa.ok && tentativa.code === SEM_PERMISSAO,
        semPermissao
          ? `permissão de insert: não; contador: ${p.contador ? "sim" : "não"}; políticas de insert: ${p.politicas_insert}; tentativa ${descrever(tentativa)}`
          : `tem permissão de inserir (tabela: ${p.tabela}, alguma coluna: ${p.alguma_coluna}) e ${p.politicas_insert} política(s) de insert — tentativa NÃO feita, para não gastar número de pedido`
      );
    });
  }

  // --- servidor (chave de serviço) grava, numa cópia da tabela ---------
  await cenario(db, async (c) => {
    const { rows: priv } = await c.q(
      `select has_table_privilege('service_role', 'public.pedidos', 'INSERT') insere,
              has_table_privilege('service_role', 'public.pedidos', 'SELECT') le,
              (select rolbypassrls from pg_roles where rolname = 'service_role') ignora_rls`
    );
    registrar(
      "pedidos 2. servidor (service_role) tem permissão de gravar e ler pedidos, ignorando a RLS",
      priv[0].insere && priv[0].le && priv[0].ignora_rls,
      `insert: ${priv[0].insere}; select: ${priv[0].le}; ignora RLS: ${priv[0].ignora_rls}`
    );

    // Cópia fiel (colunas, padrões, restrições, contador próprio) + os
    // mesmos gatilhos da tabela real.
    await c.q("create table public.zz_prova_pedidos (like public.pedidos including all)");
    await c.q(`create trigger trg_pedidos_recalcular_totais before insert on public.zz_prova_pedidos
               for each row execute function public.pedidos_recalcular_totais()`);
    await c.q(`create trigger trg_pedidos_status_atualizado_em before update on public.zz_prova_pedidos
               for each row execute function public.pedidos_set_status_atualizado_em()`);

    await c.como("service_role");
    const { sql, args } = insertDoPayload("public.zz_prova_pedidos", pedidoDoServidor({ subtotal: 0.01, total: 0.01 }));
    const gravou = await c.tentar(sql, args);
    const linha = gravou.rows?.[0];
    registrar(
      "pedidos 3. servidor grava o pedido (cópia da tabela) e recebe id e número de volta",
      gravou.ok && !!linha?.id && Number.isInteger(linha?.numero),
      gravou.ok ? `id ${linha.id}, número ${linha.numero} (contador da cópia, não o real)` : descrever(gravou)
    );
    registrar("pedidos 4. pedido nasce 'aguardando_confirmacao'", linha?.status === "aguardando_confirmacao", `status ${linha?.status}`);
    registrar(
      "pedidos 5. gatilho pedidos_recalcular_totais recalcula subtotal/total a partir dos itens",
      linha?.subtotal === 500 && linha?.total === 500,
      `enviado 0.01 / 0.01, gravado ${linha?.subtotal} / ${linha?.total} (esperado 500 / 500)`
    );
    const numeroForjado = await c.tentar(
      "insert into public.zz_prova_pedidos (numero, cliente_nome, cliente_whatsapp, modo_entrega, data_hora_entrega, forma_pagamento, itens, subtotal, total) values (999999, 'x', 'x', 'retirada', now(), 'PIX', '[{\"nome\":\"x\",\"quantidade\":1,\"preco_unitario\":1}]', 1, 1)"
    );
    registrar("pedidos 6. número do pedido não pode ser escolhido (GENERATED ALWAYS)", !numeroForjado.ok && numeroForjado.code === "428C9", descrever(numeroForjado));
  });

  // --- anônimo não lê, não altera, não apaga; logado lê, altera, apaga --
  await cenario(db, async (c) => {
    // Pedido de prova com número explícito: não usa o contador real.
    const { rows } = await c.q(
      `insert into public.pedidos (numero, cliente_nome, cliente_whatsapp, modo_entrega, data_hora_entrega, forma_pagamento, itens, subtotal, total, status_atualizado_em)
       overriding system value
       values (-1, 'PROVA_TRANSACAO_DESFEITA', '41900000000', 'retirada', now() + interval '2 days', 'PIX',
               '[{"nome":"x","quantidade":1,"preco_unitario":1}]', 1, 1, '2000-01-01')
       returning id, status_atualizado_em`
    );
    const id = rows[0].id;
    const antes = rows[0].status_atualizado_em;

    await c.como("anon");
    const le = await c.tentar("select id from public.pedidos where id = $1", [id]);
    const altera = await c.tentar("update public.pedidos set status = 'cancelado' where id = $1", [id]);
    const apaga = await c.tentar("delete from public.pedidos where id = $1", [id]);
    await c.dono();
    const { rows: depoisAnon } = await c.q("select status from public.pedidos where id = $1", [id]);
    registrar("pedidos 7. anônimo não lê pedido", !le.ok || le.rowCount === 0, descrever(le));
    registrar(
      "pedidos 8. anônimo não altera pedido",
      (!altera.ok || altera.rowCount === 0) && depoisAnon[0]?.status === "aguardando_confirmacao",
      `${descrever(altera)}; status continua ${depoisAnon[0]?.status}`
    );
    registrar("pedidos 9. anônimo não apaga pedido", (!apaga.ok || apaga.rowCount === 0) && depoisAnon.length === 1, `${descrever(apaga)}; pedido continua na tabela`);

    await c.como("authenticated");
    const leLogado = await c.tentar("select id from public.pedidos where id = $1", [id]);
    const lista = await c.tentar("select count(*)::int n from public.pedidos");
    const alteraLogado = await c.tentar("update public.pedidos set status = 'em_producao' where id = $1 returning status, status_atualizado_em", [id]);
    registrar("pedidos 10. logado lê pedidos (painel)", leLogado.ok && leLogado.rowCount === 1 && lista.ok, `pedido de prova: ${descrever(leLogado)}; total visível: ${lista.rows?.[0]?.n}`);
    registrar(
      "pedidos 11. logado altera o status (painel)",
      alteraLogado.ok && alteraLogado.rows[0]?.status === "em_producao",
      descrever(alteraLogado)
    );
    registrar(
      "pedidos 12. gatilho pedidos_set_status_atualizado_em dispara na troca de status",
      alteraLogado.ok && alteraLogado.rows[0].status_atualizado_em.getTime() !== antes.getTime(),
      `status_atualizado_em ${antes.toISOString()} -> ${alteraLogado.rows?.[0]?.status_atualizado_em?.toISOString()}`
    );
    const apagaLogado = await c.tentar("delete from public.pedidos where id = $1", [id]);
    registrar("pedidos 13. logado apaga pedido", apagaLogado.ok && apagaLogado.rowCount === 1, descrever(apagaLogado));
  });
});
