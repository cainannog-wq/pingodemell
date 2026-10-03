// Permissões do logado em pedidos e remoção do limite por IP antigo
// (supabase/pedidos-permissoes.sql), numa transação desfeita — nada é
// gravado.
//
// Com a migração (aplicada no banco ou por --com-migracao), prova direto;
// sem ela, aplica a migração num cenário desfeito e prova o mesmo. Assim a
// bateria passa nos dois estados:
//   - o painel ainda muda o status, no formato exato da Server Action
//     (src/app/admin/pedidos/actions.ts), e o gatilho de
//     status_atualizado_em continua disparando;
//   - o logado não muda nenhuma outra coluna, não apaga, não cria gatilho
//     nem chave estrangeira em pedidos; o anônimo continua sem nada;
//   - a função antiga sumiu e a v2 e criar_pedido continuam;
//   - as conferências da migração cancelam sem mudar nada em estado
//     inesperado;
//   - o desfazer volta exatamente ao estado de antes.
// A rotina de exclusão diária com a migração é provada em
// scripts/banco/exclusao-dados.mjs.
//
// Uso: node scripts/banco/permissoes-pedidos.mjs [--com-migracao=supabase/pedidos-permissoes.sql]

import { cenario, descrever, emTransacaoDesfeita, registrar, rodarMigracao, SEM_PERMISSAO } from "./lib.mjs";
import { DESFAZER_PERMISSOES_PEDIDOS, estadoPermissoesPedidos, MIGRACAO_PERMISSOES_PEDIDOS } from "./estado-permissoes-pedidos.mjs";

const COLUNAS_PROIBIDAS = {
  criado_em: "now() - interval '1 day'",
  valor_entrega: "10",
  itens: `'[{"nome":"x","quantidade":1,"preco_unitario":1}]'::jsonb`,
  total: "999",
  teste: "not teste",
  chave_idempotencia: "gen_random_uuid()",
  cliente_nome: "'PROVA alterado'",
};

// Deixa o cenário no estado "depois" (aplica a migração se ainda faltar).
async function garantirDepois(db) {
  if ((await estadoPermissoesPedidos(db)) === "antes") await rodarMigracao(db, MIGRACAO_PERMISSOES_PEDIDOS);
}

// Deixa o cenário no estado "antes" (aplica o desfazer se a migração já
// estiver no banco).
async function garantirAntes(db) {
  if ((await estadoPermissoesPedidos(db)) === "depois") await rodarMigracao(db, DESFAZER_PERMISSOES_PEDIDOS);
}

// Pedido de prova com número explícito negativo: não usa o contador real.
async function pedidoDeProva(c) {
  const { rows } = await c.q(
    `insert into public.pedidos (numero, cliente_nome, cliente_whatsapp, modo_entrega, data_hora_entrega, forma_pagamento, itens, subtotal, total, status_atualizado_em)
     overriding system value
     values (-2, 'PROVA_TRANSACAO_DESFEITA', '41900000000', 'retirada', now() + interval '2 days', 'PIX',
             '[{"nome":"x","quantidade":1,"preco_unitario":1}]', 1, 1, '2000-01-01')
     returning id, status_atualizado_em`
  );
  return rows[0];
}

// Fotografia de tudo que a migração ou o desfazer podem mexer, e do resto
// de public por assinatura: permissões das tabelas e colunas, políticas e
// funções (definição, dono, permissões e comentário). A definição da
// função antiga é comparada sem os \r: o tipo de quebra de linha do corpo
// depende de como o arquivo chega ao banco (em produção, CRLF, colado pelo
// editor SQL no Windows; o git guarda o arquivo com LF). Fora isso, o texto
// recriado pelo desfazer é o mesmo.
async function fotografia(db) {
  const { rows } = await db.query(
    `select
       (select string_agg(a.grantee::regrole::text || ':' || a.privilege_type, ',' order by a.grantee::regrole::text, a.privilege_type)
          from pg_class c, aclexplode(c.relacl) a where c.oid = 'public.pedidos'::regclass) pedidos_tabela,
       (select coalesce(string_agg(attname || '=' || attacl::text, ';' order by attnum), 'nenhuma')
          from pg_attribute where attrelid = 'public.pedidos'::regclass and attnum > 0 and attacl is not null) pedidos_colunas,
       (select string_agg(polname || ' ' || polcmd::text || ' ' || polroles::regrole[]::text || ' ' || coalesce(pg_get_expr(polqual, polrelid), '-') || ' ' || coalesce(pg_get_expr(polwithcheck, polrelid), '-'), ' | ' order by polname)
          from pg_policy where polrelid = 'public.pedidos'::regclass) pedidos_politicas,
       (select coalesce(md5(replace(pg_get_functiondef(p.oid), chr(13), '')) || ' dono ' || pg_get_userbyid(p.proowner) || ' ' ||
               (select string_agg(a.grantee::regrole::text || ':' || a.privilege_type, ',' order by a.grantee::regrole::text, a.privilege_type) from aclexplode(p.proacl) a) ||
               ' comentário ' || coalesce(obj_description(p.oid, 'pg_proc'), '-'), 'não existe')
          from (select to_regprocedure('public.registrar_tentativa_pedido(text, integer, integer)') oid) f
          left join pg_proc p on p.oid = f.oid) funcao_antiga,
       (select md5(string_agg(c.relname || coalesce(c.relacl::text, '-'), '|' order by c.relname))
          from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm') and c.relname <> 'pedidos') outras_tabelas,
       (select md5(string_agg(p.oid::regprocedure::text || coalesce(p.proacl::text, '-') || md5(pg_get_functiondef(p.oid)), '|' order by p.oid::regprocedure::text))
          from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and p.proname <> 'registrar_tentativa_pedido') outras_funcoes,
       (select md5(string_agg(polrelid::regclass::text || polname, '|' order by polrelid::regclass::text, polname))
          from pg_policy where polrelid <> 'public.pedidos'::regclass) outras_politicas`
  );
  return rows[0];
}

const diferencas = (a, b) =>
  Object.keys(a)
    .filter((k) => a[k] !== b[k])
    .map((k) => `${k}: ${a[k]} -> ${b[k]}`);

await emTransacaoDesfeita("Permissões do logado em pedidos e remoção de registrar_tentativa_pedido", async (db) => {
  const inicial = await estadoPermissoesPedidos(db);
  console.log(
    inicial === "depois"
      ? "Migração pedidos-permissoes.sql no banco (aplicada ou por --com-migracao): prova direto."
      : "Migração pedidos-permissoes.sql ainda não está no banco: cada cenário a aplica dentro da transação desfeita."
  );

  // --- 1. catálogo -------------------------------------------------------
  await cenario(db, async (c) => {
    await garantirDepois(db);
    const { rows } = await c.q(
      `select has_table_privilege('authenticated', 'public.pedidos', 'SELECT') le,
              has_table_privilege('authenticated', 'public.pedidos', 'UPDATE') altera_tabela,
              has_table_privilege('authenticated', 'public.pedidos', 'DELETE') apaga,
              has_table_privilege('authenticated', 'public.pedidos', 'INSERT') insere,
              has_table_privilege('authenticated', 'public.pedidos', 'TRUNCATE') trunca,
              has_table_privilege('authenticated', 'public.pedidos', 'REFERENCES') referencia,
              has_table_privilege('authenticated', 'public.pedidos', 'TRIGGER') gatilho,
              (select string_agg(attname, ',' order by attname) from pg_attribute
                 where attrelid = 'public.pedidos'::regclass and attnum > 0 and not attisdropped
                   and has_column_privilege('authenticated', 'public.pedidos'::regclass, attname, 'UPDATE')) colunas_update,
              (select string_agg(polname || ' ' || polcmd::text, ', ' order by polname) from pg_policy where polrelid = 'public.pedidos'::regclass) politicas,
              (select relforcerowsecurity from pg_class where oid = 'public.pedidos'::regclass) forca_rls`
    );
    const p = rows[0];
    registrar(
      "permissões-pedidos 1. logado: lê a tabela, UPDATE só na coluna status; sem DELETE, INSERT, TRUNCATE, REFERENCES, TRIGGER",
      p.le && !p.altera_tabela && !p.apaga && !p.insere && !p.trunca && !p.referencia && !p.gatilho && p.colunas_update === "status",
      `leitura ${p.le}; update na tabela ${p.altera_tabela}; colunas com update: ${p.colunas_update}; delete ${p.apaga}; insert ${p.insere}; truncate ${p.trunca}; references ${p.referencia}; trigger ${p.gatilho}`
    );
    registrar(
      "permissões-pedidos 2. políticas de pedidos: só leitura e atualização (a de exclusão saiu); RLS não forçada",
      p.politicas === "Autenticado pode atualizar pedidos w, Autenticado pode ver pedidos r" && p.forca_rls === false,
      `políticas: ${p.politicas}; RLS forçada: ${p.forca_rls}`
    );
  });

  // --- 2. painel: o formato exato da Server Action ----------------------
  await cenario(db, async (c) => {
    await garantirDepois(db);
    const { id, status_atualizado_em: antes } = await pedidoDeProva(c);
    await c.como("authenticated");
    const acao = "update public.pedidos set status = $2 where id = $1 and status = $3 returning id";
    const primeira = await c.tentar(acao, [id, "em_producao", "aguardando_confirmacao"]);
    const repetida = await c.tentar(acao, [id, "em_producao", "aguardando_confirmacao"]);
    const seguinte = await c.tentar(acao, [id, "entregue", "em_producao"]);
    await c.dono();
    const { rows } = await c.q("select status, status_atualizado_em from public.pedidos where id = $1", [id]);
    registrar(
      "permissões-pedidos 3. painel: update set status = 'em_producao' where id and status = 'aguardando_confirmacao' returning id volta 1 linha e muda status_atualizado_em",
      primeira.ok && primeira.rowCount === 1 && primeira.rows[0].id === id && rows[0].status_atualizado_em.getTime() !== antes.getTime(),
      `${descrever(primeira)}; status_atualizado_em ${antes.toISOString()} -> ${rows[0].status_atualizado_em.toISOString()}`
    );
    registrar(
      "permissões-pedidos 4. painel: repetido com o status já trocado volta 0 linhas (atualizado em outra aba)",
      repetida.ok && repetida.rowCount === 0,
      descrever(repetida)
    );
    registrar(
      "permissões-pedidos 5. painel: a transição seguinte (em_producao -> entregue) também funciona",
      seguinte.ok && seguinte.rowCount === 1 && rows[0].status === "entregue",
      `${descrever(seguinte)}; status final ${rows[0].status}`
    );
  });

  // --- 3. o que o logado não pode mais ----------------------------------
  await cenario(db, async (c) => {
    await garantirDepois(db);
    const { id } = await pedidoDeProva(c);
    const { rows: antes } = await c.q("select t::text linha from public.pedidos t where id = $1", [id]);
    await c.como("authenticated");
    const colunas = [];
    for (const [coluna, valor] of Object.entries(COLUNAS_PROIBIDAS)) {
      colunas.push([coluna, await c.tentar(`update public.pedidos set ${coluna} = ${valor} where id = $1`, [id])]);
    }
    const junto = await c.tentar("update public.pedidos set status = 'em_producao', observacoes = 'PROVA' where id = $1", [id]);
    const apaga = await c.tentar("delete from public.pedidos where id = $1", [id]);
    const apagaTudo = await c.tentar("delete from public.pedidos");
    await c.dono();
    const { rows: depois } = await c.q("select t::text linha from public.pedidos t where id = $1", [id]);
    registrar(
      `permissões-pedidos 6. logado: update de ${Object.keys(COLUNAS_PROIBIDAS).join(", ")} dá 42501`,
      colunas.every(([, r]) => !r.ok && r.code === SEM_PERMISSAO),
      colunas.map(([coluna, r]) => `${coluna}: ${descrever(r)}`).join("\n       ")
    );
    registrar(
      "permissões-pedidos 7. logado: update de status junto com outra coluna dá 42501 (nada muda)",
      !junto.ok && junto.code === SEM_PERMISSAO,
      descrever(junto)
    );
    registrar(
      "permissões-pedidos 8. logado: delete dá 42501 (um pedido ou todos); o pedido continua igual",
      !apaga.ok && apaga.code === SEM_PERMISSAO && !apagaTudo.ok && apagaTudo.code === SEM_PERMISSAO && depois[0]?.linha === antes[0].linha,
      `um pedido: ${descrever(apaga)}; todos: ${descrever(apagaTudo)}; pedido ${depois[0]?.linha === antes[0].linha ? "igual" : "MUDOU"}`
    );
  });

  await cenario(db, async (c) => {
    await garantirDepois(db);
    const { id } = await pedidoDeProva(c);
    await c.como("anon");
    const le = await c.tentar("select id from public.pedidos where id = $1", [id]);
    const altera = await c.tentar("update public.pedidos set status = 'em_producao' where id = $1", [id]);
    const apaga = await c.tentar("delete from public.pedidos where id = $1", [id]);
    await c.dono();
    registrar(
      "permissões-pedidos 9. anônimo continua sem nada: ler, mudar status e apagar dão 42501",
      [le, altera, apaga].every((r) => !r.ok && r.code === SEM_PERMISSAO),
      `ler ${descrever(le)}; status ${descrever(altera)}; apagar ${descrever(apaga)}`
    );
  });

  // --- 4. REFERENCES e TRIGGER: nada usava ------------------------------
  await cenario(db, async (c) => {
    // Medido antes da migração: o que usaria as duas permissões.
    await garantirAntes(db);
    const { rows } = await c.q(
      `select (select count(*)::int from pg_constraint where confrelid = 'public.pedidos'::regclass) fks,
              (select string_agg(tgname || ' ' || pg_get_userbyid(p.proowner), ', ' order by tgname)
                 from pg_trigger t join pg_proc p on p.oid = t.tgfoid where tgrelid = 'public.pedidos'::regclass and not tgisinternal) gatilhos,
              (select string_agg(nspname, ', ') from pg_namespace
                 where has_schema_privilege('authenticated', oid, 'CREATE')) schemas_com_create`
    );
    const u = rows[0];
    // Antes, a permissão TRIGGER na tabela passa e a recusa vem da função
    // do gatilho; depois, a recusa vem da tabela.
    const criarGatilho =
      "create trigger zz_prova before update on public.pedidos for each row execute function public.pedidos_set_status_atualizado_em()";
    await c.como("authenticated");
    const gatilhoAntes = await c.tentar(criarGatilho);
    await c.dono();
    await garantirDepois(db);
    await c.como("authenticated");
    const gatilhoDepois = await c.tentar(criarGatilho);
    await c.dono();
    registrar(
      "permissões-pedidos 10. REFERENCES e TRIGGER sem uso: nenhuma chave estrangeira aponta para pedidos, os gatilhos são do postgres, o logado não cria objeto em schema nenhum (logo, nem chave estrangeira); depois da migração, criar gatilho em pedidos como logado é recusado pela tabela",
      u.fks === 0 && !u.schemas_com_create && /^trg_pedidos_recalcular_totais postgres, trg_pedidos_status_atualizado_em postgres$/.test(u.gatilhos ?? "") &&
        !gatilhoAntes.ok && /function/.test(gatilhoAntes.message) &&
        !gatilhoDepois.ok && gatilhoDepois.code === SEM_PERMISSAO && /table pedidos/.test(gatilhoDepois.message),
      `chaves estrangeiras para pedidos: ${u.fks}; gatilhos: ${u.gatilhos}; schemas com CREATE para o logado: ${u.schemas_com_create ?? "nenhum"}; criar gatilho antes: ${descrever(gatilhoAntes)}; depois: ${descrever(gatilhoDepois)}`
    );
  });

  // --- 5. função antiga removida -----------------------------------------
  await cenario(db, async (c) => {
    await garantirDepois(db);
    const { rows } = await c.q(
      `select to_regprocedure('public.registrar_tentativa_pedido(text, integer, integer)') is null removida,
              to_regprocedure('public.registrar_tentativa_pedido_v2(text, integer, integer)') is not null v2,
              to_regprocedure('public.criar_pedido(text, uuid, jsonb, boolean, text, integer, integer)') is not null criar,
              (select string_agg(oid::regprocedure::text, ', ') from pg_proc where prosrc ~ '\\mregistrar_tentativa_pedido\\M') citam`
    );
    const f = rows[0];
    registrar(
      "permissões-pedidos 11. registrar_tentativa_pedido removida; registrar_tentativa_pedido_v2 e criar_pedido continuam; nenhuma função cita a antiga",
      f.removida && f.v2 && f.criar && !f.citam,
      `antiga removida: ${f.removida}; v2: ${f.v2}; criar_pedido: ${f.criar}; funções que citam a antiga: ${f.citam ?? "nenhuma"}`
    );
  });

  // --- 6. conferências da migração --------------------------------------
  for (const [nome, preparo] of [
    ["permissão por coluna esquecida (attacl)", "grant select (cliente_nome) on public.pedidos to authenticated"],
    [
      "outra função cita registrar_tentativa_pedido",
      "create function public.zz_prova_cita() returns void language sql set search_path = '' as 'select null::void /* registrar_tentativa_pedido */'",
    ],
  ]) {
    await cenario(db, async (c) => {
      await garantirAntes(db);
      await c.q(preparo);
      const antes = await fotografia(db);
      await c.q("savepoint conferencia");
      let erro = null;
      try {
        await rodarMigracao(db, MIGRACAO_PERMISSOES_PEDIDOS);
      } catch (e) {
        erro = e;
      }
      await c.q("rollback to savepoint conferencia");
      const depois = await fotografia(db);
      registrar(
        `permissões-pedidos 12. a migração cancela sem mudar nada quando ${nome}`,
        erro !== null && /cancelada/.test(erro.message) && diferencas(antes, depois).length === 0,
        erro ? `cancelou: ${erro.message}` : "NÃO cancelou"
      );
    });
  }

  // --- 7. desfazer --------------------------------------------------------
  await cenario(db, async (c) => {
    await garantirAntes(db);
    const antes = await fotografia(db);
    await rodarMigracao(db, MIGRACAO_PERMISSOES_PEDIDOS);
    const meio = await fotografia(db);
    await rodarMigracao(db, DESFAZER_PERMISSOES_PEDIDOS);
    const depois = await fotografia(db);
    const mudouNaMigracao = diferencas(antes, meio).map((d) => d.split(":")[0]);
    registrar(
      "permissões-pedidos 13. a migração só mexe em pedidos (tabela, colunas, políticas) e na função antiga; o resto de public fica igual",
      mudouNaMigracao.length > 0 && mudouNaMigracao.every((k) => ["pedidos_tabela", "pedidos_colunas", "pedidos_politicas", "funcao_antiga"].includes(k)),
      diferencas(antes, meio).join("\n       ")
    );
    registrar(
      "permissões-pedidos 14. o desfazer volta exatamente ao estado de antes (permissões, política de exclusão e função com o mesmo corpo, dono e permissões)",
      diferencas(antes, depois).length === 0 && (await estadoPermissoesPedidos(db)) === "antes",
      diferencas(antes, depois).length ? diferencas(antes, depois).join("\n       ") : `igual: ${JSON.stringify(depois)}`
    );
  });
});
