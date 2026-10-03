// Migração do slug em transação desfeita — nada é gravado:
//   1. etapa 1 (supabase/produtos-slug.sql), se ainda não estiver no banco:
//      os produtos existentes ganham slug e NADA mais muda (atualizado_em
//      de cada um, ordem de "Os mais pedidos", linhas e conteúdo de todas
//      as tabelas de public);
//   2. etapa 2 (supabase/produtos-slug-obrigatorio.sql), num cenário
//      desfeito: slug obrigatório e gatilho de edição sem o ramo
//      "vazio -> preenchido";
//   3. desfazer (supabase/produtos-slug-desfazer.sql), num cenário desfeito:
//      o banco fica igual ao de antes da etapa 1 (estrutura e dados);
//   4. desfazer da etapa 2 (supabase/produtos-slug-obrigatorio-desfazer.sql),
//      num cenário desfeito: slug volta a aceitar vazio, gatilho de edição
//      volta ao da etapa 1, e a etapa 2 pode ser aplicada de novo.
//
// Com a etapa 2 já aplicada no banco (02/10/2026), os cenários 7, 8 e 9
// simulam o estado antigo (produto sem slug; desfazer a etapa 1 direto) e
// são pulados, sem sair do arquivo.
//
// Uso: node scripts/banco/slug-migracao.mjs
// (não usa --com-migracao: aplica a etapa 1 sozinho quando ela falta)

import path from "node:path";
import { cenario, descrever, emTransacaoDesfeita, pular, raiz, registrar, rodarMigracao } from "./lib.mjs";

const ETAPA_1 = path.join(raiz, "supabase", "produtos-slug.sql");
const ETAPA_2 = path.join(raiz, "supabase", "produtos-slug-obrigatorio.sql");
const DESFAZER = path.join(raiz, "supabase", "produtos-slug-desfazer.sql");
const DESFAZER_ETAPA_2 = path.join(raiz, "supabase", "produtos-slug-obrigatorio-desfazer.sql");
const MOTIVO_ETAPA_2 = "etapa 2 aplicada no banco (slug NOT NULL); simula o estado de antes dela";

// Fotografia de public, sem nada do slug (coluna, funções, gatilhos,
// restrições e índices com "slug" no nome ficam de fora). Assim a mesma
// fotografia serve para comparar "antes da etapa 1" com "depois do
// desfazer", e os dados de "antes" com os de "depois da etapa 1".
async function fotografar(db) {
  const dados = {};
  const estrutura = {};
  const { rows: tabelas } = await db.query(
    `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p') order by 1`
  );
  for (const { relname } of tabelas) {
    const { rows } = await db.query(
      `select count(*)::int n, coalesce(md5(string_agg((to_jsonb(t) - 'slug')::text, '|' order by (to_jsonb(t) - 'slug')::text)), '-') assinatura
       from public.${JSON.stringify(relname)} t`
    );
    dados[`public.${relname}`] = `${rows[0].n} linha(s), conteúdo ${rows[0].assinatura.slice(0, 10)}`;
  }
  const consultas = {
    coluna: `select table_name || '.' || column_name k, data_type || ' null=' || is_nullable || ' default=' || coalesce(column_default, '') v
             from information_schema.columns where table_schema = 'public' and not (table_name = 'produtos' and column_name = 'slug')`,
    restricao: `select conrelid::regclass || '.' || conname k, pg_get_constraintdef(oid) v from pg_constraint
                where connamespace = 'public'::regnamespace and conname not like '%slug%'`,
    indice: `select indexname k, indexdef v from pg_indexes where schemaname = 'public' and indexname not like '%slug%'`,
    gatilho: `select c.relname || '.' || t.tgname k, pg_get_triggerdef(t.oid) || ' ' || t.tgenabled::text v
              from pg_trigger t join pg_class c on c.oid = t.tgrelid
              where c.relnamespace = 'public'::regnamespace and not t.tgisinternal and t.tgname not like '%slug%'`,
    funcao: `select p.oid::regprocedure::text k, md5(pg_get_functiondef(p.oid)) || ' acl=' || coalesce(p.proacl::text, '') v
             from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname not like '%slug%'`,
    politica: `select tablename || '.' || policyname k, cmd || ' ' || roles::text || ' ' || coalesce(qual, '') || ' ' || coalesce(with_check, '') v
               from pg_policies where schemaname = 'public'`,
  };
  for (const [tipo, sql] of Object.entries(consultas)) {
    const { rows } = await db.query(sql);
    for (const { k, v } of rows) estrutura[`${tipo} ${k}`] = v;
  }
  return { dados, estrutura };
}

function diferencas(a, b) {
  const saida = [];
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (a[k] !== b[k]) saida.push(`${k}: antes ${a[k] ?? "-"} | depois ${b[k] ?? "-"}`);
  }
  return saida;
}

// Mesma regra de src/lib/vitrine/mais-pedidos.ts (ativo, destaque, fora
// Bebidas, atualizado_em mais recente primeiro, desempate pelo nome, 10).
async function maisPedidos(db) {
  const { rows } = await db.query(
    `select nome from public.produtos
     where ativo and destaque and "Categoria" is distinct from 'Bebidas'
     order by atualizado_em desc, nome limit 10`
  );
  return rows.map((r) => r.nome);
}

async function temSlug(db) {
  const { rows } = await db.query(
    `select 1 from information_schema.columns where table_schema = 'public' and table_name = 'produtos' and column_name = 'slug'`
  );
  return rows.length > 0;
}

async function slugObrigatorio(db) {
  const { rows } = await db.query(
    `select is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'produtos' and column_name = 'slug'`
  );
  return rows[0]?.is_nullable === "NO";
}

async function objetosDoSlug(db) {
  const { rows } = await db.query(
    `select 'coluna produtos.slug' o from information_schema.columns where table_schema = 'public' and table_name = 'produtos' and column_name = 'slug'
     union all select 'função ' || proname from pg_proc where pronamespace = 'public'::regnamespace and proname like '%slug%'
     union all select 'gatilho ' || tgname from pg_trigger where tgrelid = 'public.produtos'::regclass and tgname like '%slug%'
     union all select 'restrição ' || conname from pg_constraint where conrelid = 'public.produtos'::regclass and conname like '%slug%'`
  );
  return rows.map((r) => r.o);
}

await emTransacaoDesfeita("Slug — etapa 1 sobre os produtos existentes, etapa 2 e desfazer", async (db) => {
  const antes = await fotografar(db);
  const jaAplicada = await temSlug(db);
  const etapa2NoBanco = await slugObrigatorio(db);

  if (jaAplicada) {
    console.log("\nEtapa 1 já está no banco: prova só a etapa 2 e o desfazer.");
  } else {
    const { rows: produtosAntes } = await db.query(
      `select id, nome, ativo, destaque, atualizado_em from public.produtos order by nome`
    );
    const homeAntes = await maisPedidos(db);

    await rodarMigracao(db, ETAPA_1);
    console.log("Etapa 1 (supabase/produtos-slug.sql) aplicada DENTRO da transação desfeita.");

    const { rows: produtosDepois } = await db.query(
      `select id, nome, ativo, destaque, slug, atualizado_em from public.produtos order by nome`
    );
    console.log("\n       nome | ativo | destaque | slug | atualizado_em antes | depois");
    let todosIguais = produtosAntes.length === produtosDepois.length;
    for (const p of produtosAntes) {
      const d = produtosDepois.find((x) => x.id === p.id);
      const igual = d && d.atualizado_em.toISOString() === p.atualizado_em.toISOString();
      if (!igual) todosIguais = false;
      console.log(
        `       ${p.nome} | ${p.ativo ? "sim" : "não"} | ${p.destaque ? "sim" : "não"} | ${d?.slug ?? "(sem)"} | ${p.atualizado_em.toISOString()} | ${d?.atualizado_em.toISOString() ?? "-"}${igual ? "" : "  <- MUDOU"}`
      );
    }
    const slugs = produtosDepois.map((p) => p.slug);
    registrar(
      `slug-migração 1. etapa 1: os ${produtosAntes.length} produtos ganham slug, todos diferentes`,
      slugs.every(Boolean) && new Set(slugs).size === slugs.length,
      `${slugs.filter(Boolean).length} com slug, ${new Set(slugs).size} diferentes`
    );
    registrar("slug-migração 2. etapa 1: atualizado_em de cada produto idêntico antes e depois", todosIguais, "");

    const homeDepois = await maisPedidos(db);
    registrar(
      "slug-migração 3. etapa 1: ordem de \"Os mais pedidos\" igual",
      homeAntes.join(" | ") === homeDepois.join(" | "),
      `antes: ${homeAntes.join(", ")}\n       depois: ${homeDepois.join(", ")}`
    );

    const depois = await fotografar(db);
    const difDados = diferencas(antes.dados, depois.dados);
    console.log("\n       Tabelas de public (linhas e conteúdo, sem a coluna slug), antes -> depois da etapa 1:");
    for (const [k, v] of Object.entries(antes.dados)) console.log(`       ${v === depois.dados[k] ? "igual" : "MUDOU"}  ${k.padEnd(30)} ${v}`);
    registrar(
      "slug-migração 4. etapa 1: linhas e conteúdo de todas as tabelas de public iguais (fora a coluna nova)",
      difDados.length === 0,
      difDados.join(" | ") || `${Object.keys(antes.dados).length} tabelas iguais`
    );
    const difEstrutura = diferencas(antes.estrutura, depois.estrutura);
    registrar(
      "slug-migração 5. etapa 1: fora os objetos do slug, a estrutura de public não muda (colunas, restrições, índices, gatilhos, funções, políticas)",
      difEstrutura.length === 0,
      difEstrutura.join(" | ") || `${Object.keys(antes.estrutura).length} itens iguais`
    );
  }

  // --- etapa 2 ------------------------------------------------------------
  await cenario(db, async (c) => {
    await rodarMigracao(db, ETAPA_2);
    const { rows: col } = await c.q(
      `select is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'produtos' and column_name = 'slug'`
    );
    const { rows: fn } = await c.q(`select pg_get_functiondef('public.produtos_slug_imutavel()'::regprocedure) def`);
    await c.q("insert into public.produtos (nome, preco, pedido_minimo, \"Categoria\") values ('PROVA Etapa 2', 1, 1, 'Doces')");
    const renomeia = await c.tentar("update public.produtos set nome = 'PROVA Etapa 2 Renomeado' where nome = 'PROVA Etapa 2'");
    const troca = await c.tentar("update public.produtos set slug = 'outro' where nome = 'PROVA Etapa 2 Renomeado'");
    const semSlug = await c.tentar("insert into public.produtos (nome, preco, pedido_minimo, slug, \"Categoria\") values ('PROVA Etapa 2 B', 1, 1, null, 'Doces') returning slug");
    const { rows: acl } = await c.q(
      `select has_function_privilege('anon', 'public.produtos_slug_imutavel()', 'EXECUTE') anon,
              has_function_privilege('authenticated', 'public.produtos_slug_imutavel()', 'EXECUTE') logado`
    );
    const semRamo = !fn[0].def.includes("to_jsonb") && !fn[0].def.includes("atualizado_em :=");
    registrar(
      "slug-migração 6. etapa 2: slug obrigatório, gatilho de edição sem o ramo \"vazio -> preenchido\", renomear ok, trocar recusado, cadastro continua gerando",
      col[0].is_nullable === "NO" && semRamo && renomeia.ok && !troca.ok && troca.code === "23514" && semSlug.ok && semSlug.rows[0].slug === "prova-etapa-2-b" && !acl[0].anon && !acl[0].logado,
      `obrigatório: ${col[0].is_nullable === "NO"}; ramo removido: ${semRamo}; renomear ${descrever(renomeia)}; trocar ${descrever(troca)}; cadastro -> ${semSlug.ok ? semSlug.rows[0].slug : descrever(semSlug)}; anon/logado executam: ${acl[0].anon}/${acl[0].logado}`
    );
  });

  // 7, 8 e 9 simulam o estado de antes da etapa 2 (produto sem slug; o
  // desfazer da etapa 1 sobre a coluna ainda opcional). Com a etapa 2 no
  // banco, não se aplicam: o 10 cobre o desfazer que vale agora.
  if (etapa2NoBanco) {
    pular("slug-migração 7.", `${MOTIVO_ETAPA_2} (produto sem slug não existe mais)`);
    pular("slug-migração 8.", `${MOTIVO_ETAPA_2} (desfazer da etapa 1 só depois do desfazer da etapa 2)`);
    pular("slug-migração 9.", `${MOTIVO_ETAPA_2} (depende do 8)`);
  } else await cenario(db, async (c) => {
    // Produto sem slug (gatilho de cadastro desligado só neste cenário):
    // a etapa 2 precisa recusar tudo.
    await c.q("alter table public.produtos disable trigger produtos_slug_no_cadastro");
    await c.q("insert into public.produtos (nome, preco, pedido_minimo, \"Categoria\") values ('PROVA Sem Slug Etapa 2', 1, 1, 'Doces')");
    await c.q("alter table public.produtos enable trigger produtos_slug_no_cadastro");
    let r;
    await c.q("savepoint etapa2");
    try {
      await rodarMigracao(db, ETAPA_2);
      await c.q("release savepoint etapa2");
      r = { ok: true };
    } catch (erro) {
      await c.q("rollback to savepoint etapa2");
      r = { ok: false, message: erro.message };
    }
    registrar(
      "slug-migração 7. etapa 2 se cancela inteira se existir produto sem slug",
      !r.ok && /sem slug/.test(r.message),
      r.ok ? "aplicou (ERRADO)" : `recusada: ${r.message}`
    );
  });

  // --- desfazer -------------------------------------------------------------
  if (!etapa2NoBanco) await cenario(db, async (c) => {
    await rodarMigracao(db, DESFAZER);
    const depois = await fotografar(db);
    const dif = [...diferencas(antes.dados, depois.dados), ...diferencas(antes.estrutura, depois.estrutura)];
    const sobras = await objetosDoSlug(db);
    registrar(
      `slug-migração 8. desfazer: banco igual ao de antes da etapa 1 (${Object.keys(antes.dados).length} tabelas, ${Object.keys(antes.estrutura).length} itens de estrutura) e nada do slug sobra`,
      dif.length === 0 && sobras.length === 0,
      [...dif, ...sobras.map((s) => `sobrou ${s}`)].join(" | ") || "idêntico"
    );
    // Depois do desfazer, o admin continua cadastrando e editando.
    await c.como("authenticated");
    const cad = await c.tentar("insert into public.produtos (nome, preco, pedido_minimo, \"Categoria\") values ('PROVA Depois Desfazer', 1, 1, 'Doces')");
    const ed = await c.tentar("update public.produtos set nome = 'PROVA Depois Desfazer 2' where nome = 'PROVA Depois Desfazer'");
    registrar("slug-migração 9. desfazer: admin cadastra e edita normalmente depois", cad.ok && ed.ok, `cadastro ${descrever(cad)}; edição ${descrever(ed)}`);
  });

  // --- desfazer da etapa 2 ----------------------------------------------------
  await cenario(db, async (c) => {
    if (!etapa2NoBanco) await rodarMigracao(db, ETAPA_2);
    await rodarMigracao(db, DESFAZER_ETAPA_2);
    const { rows: col } = await c.q(
      `select is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'produtos' and column_name = 'slug'`
    );
    const { rows: fn } = await c.q(`select pg_get_functiondef('public.produtos_slug_imutavel()'::regprocedure) def`);
    const { rows: gat } = await c.q(
      `select tgenabled from pg_trigger where tgrelid = 'public.produtos'::regclass and tgname = 'produtos_slug_imutavel'`
    );
    const { rows: acl } = await c.q(
      `select has_function_privilege('anon', 'public.produtos_slug_imutavel()', 'EXECUTE') anon,
              has_function_privilege('authenticated', 'public.produtos_slug_imutavel()', 'EXECUTE') logado`
    );
    const depois = await fotografar(db);
    const dif = [...diferencas(antes.dados, depois.dados), ...diferencas(antes.estrutura, depois.estrutura)];
    // O ramo da etapa 1 volta: preencher um slug vazio mantém o atualizado_em.
    await c.q("alter table public.produtos disable trigger produtos_slug_no_cadastro");
    await c.q("insert into public.produtos (nome, preco, pedido_minimo, atualizado_em, \"Categoria\") values ('PROVA Desfazer Etapa 2', 1, 1, '2001-02-03 04:05:06+00', 'Doces')");
    await c.q("alter table public.produtos enable trigger produtos_slug_no_cadastro");
    await c.q("update public.produtos set slug = public.produto_slug_livre(nome) where nome = 'PROVA Desfazer Etapa 2'");
    const { rows: p } = await c.q("select slug, atualizado_em from public.produtos where nome = 'PROVA Desfazer Etapa 2'");
    const ramo = fn[0].def.includes("to_jsonb(new) - 'slug' - 'atualizado_em'") && fn[0].def.includes("new.atualizado_em := old.atualizado_em");
    const preenche = p[0].slug === "prova-desfazer-etapa-2" && p[0].atualizado_em.toISOString() === "2001-02-03T04:05:06.000Z";
    // E a etapa 2 pode ser aplicada de novo por cima.
    let reaplica;
    try {
      await rodarMigracao(db, ETAPA_2);
      const { rows } = await c.q(
        `select is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'produtos' and column_name = 'slug'`
      );
      reaplica = rows[0].is_nullable === "NO";
    } catch (erro) {
      reaplica = false;
      console.log(`       etapa 2 de novo: ${erro.message}`);
    }
    registrar(
      "slug-migração 10. desfazer da etapa 2: slug volta a aceitar vazio, gatilho de edição volta ao da etapa 1 (preencher mantém o atualizado_em), nada mais muda e a etapa 2 reaplica",
      col[0].is_nullable === "YES" && ramo && gat[0]?.tgenabled === "O" && !acl[0].anon && !acl[0].logado && dif.length === 0 && preenche && reaplica,
      `aceita vazio: ${col[0].is_nullable === "YES"}; ramo da etapa 1: ${ramo}; gatilho ${gat[0]?.tgenabled ?? "ausente"}; anon/logado executam: ${acl[0].anon}/${acl[0].logado}; ` +
        `resto igual: ${dif.length === 0 ? "sim" : dif.join(" | ")}; preenchimento ${p[0].slug} ${p[0].atualizado_em.toISOString()}; etapa 2 de novo: ${reaplica}`
    );
  });
});
