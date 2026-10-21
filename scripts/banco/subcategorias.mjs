// Subcategorias (supabase/subcategorias.sql e o desfazer), numa transação
// desfeita — nada é gravado. Funciona nos dois estados do banco:
//   - tabela ainda não existe (e sem --com-migracao): o teste aplica
//     supabase/subcategorias.sql DENTRO da transação desfeita;
//   - tabela já existe (aplicada em produção, ou aplicada por
//     --com-migracao=supabase/subcategorias.sql): usa o que está lá. As provas
//     que dependem da semente intacta (21 linhas, ordem 70 no fim de Doces,
//     categoria sem subcategoria) só valem para a migração recém-aplicada ou
//     para uma semente que ninguém mexeu; fora disso saem como puladas.
//
// Antes das demais provas, um cenário faz a ida e volta (migração e desfazer)
// e confere que a assinatura do banco (funções, gatilhos, colunas, índices,
// restrições, políticas e tabelas) é a mesma de antes.
//
// Uso: node scripts/banco/subcategorias.mjs [--com-migracao=supabase/subcategorias.sql]

import path from "node:path";
import {
  cenario,
  comMigracao,
  descrever,
  emTransacaoDesfeita,
  MIGRACOES,
  pular,
  raiz,
  registrar,
  rodarMigracao,
  SEM_PERMISSAO,
} from "./lib.mjs";

const MIGRACAO = path.join(raiz, "supabase", "subcategorias.sql");
const DESFAZER = path.join(raiz, "supabase", "subcategorias-desfazer.sql");

const CHECK = "23514";
const UNICO = "23505";
const CHAVE = "23503";

const SEMENTE = [
  ["Bolos", "Tradicional", "tradicional", 10],
  ["Bolos", "Caseirinhos", "caseirinhos", 20],
  ["Bolos", "Decorados", "decorados", 30],
  ["Bolos", "Smash Cake", "smash-cake", 40],
  ["Doces", "Tradicionais", "tradicionais", 10],
  ["Doces", "Gourmet", "gourmet", 20],
  ["Doces", "Gourmet Premium", "gourmet-premium", 30],
  ["Doces", "Finos", "finos", 40],
  ["Doces", "Personalizados", "personalizados", 50],
  ["Doces", "Personalizados Combo", "personalizados-combo", 60],
  ["Doces", "Donuts", "donuts", 70],
  ["Salgados", "Fritos", "fritos", 10],
  ["Salgados", "Assados", "assados", 20],
  ["Salgados", "Finos e Assados", "finos-e-assados", 30],
  ["Salgados", "Congelados", "congelados", 40],
  ["Kit Festa", "Básico", "basico", 10],
  ["Kit Festa", "Clássico", "classico", 20],
  ["Kit Festa", "Premium", "premium", 30],
  ["Kit Festa", "Escolar", "escolar", 40],
  ["Kit Festa", "Mini Wedding", "mini-wedding", 50],
  ["Kit Festa", "Outros", "outros", 60],
];
const linhaDaSemente = (r) => r.join("|");
const SEMENTE_ORDENADA = [...SEMENTE].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[3] - b[3])).map(linhaDaSemente);

const SQL_MD5_PRODUTOS = `select count(*)::int n, md5(string_agg(id::text || nome || "Categoria"::text || atualizado_em::text, '|' order by id)) h from public.produtos`;

// Assinatura do banco: o que a migração cria e o desfazer tem que remover.
const SQL_ASSINATURA = `
  select
    (select md5(string_agg(p.proname || replace(pg_get_functiondef(p.oid), chr(13), ''), '|' order by p.proname)) from pg_proc p where p.pronamespace = 'public'::regnamespace) funcoes,
    (select string_agg(tgname || '=' || tgenabled::text, ',' order by tgname) from pg_trigger where tgrelid = 'public.produtos'::regclass and not tgisinternal) gatilhos,
    (select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_schema = 'public' and table_name = 'produtos') colunas,
    (select string_agg(indexname, ',' order by indexname) from pg_indexes where schemaname = 'public' and tablename = 'produtos') indices,
    (select string_agg(conname || ':' || pg_get_constraintdef(oid), ',' order by conname) from pg_constraint where conrelid = 'public.produtos'::regclass) restricoes,
    (select string_agg(relname, ',' order by relname) from pg_class where relnamespace = 'public'::regnamespace and relkind in ('r', 'p')) tabelas,
    (select count(*)::int from pg_policy p join pg_class c on c.oid = p.polrelid where c.relnamespace = 'public'::regnamespace) politicas`;

async function assinatura(db) {
  const { rows } = await db.query(SQL_ASSINATURA);
  return JSON.stringify(rows[0]);
}

async function existe(db) {
  const { rows } = await db.query("select to_regclass('public.subcategorias') is not null e");
  return rows[0].e;
}

// Aplica um arquivo num savepoint; erro volta como { ok: false }.
async function aplicar(db, arquivo) {
  await db.query("savepoint arquivo");
  try {
    await rodarMigracao(db, arquivo);
    await db.query("release savepoint arquivo");
    return { ok: true };
  } catch (erro) {
    await db.query("rollback to savepoint arquivo");
    return { ok: false, message: erro.message };
  }
}

const idDe = async (c, categoria, slug) =>
  (await c.q("select id from public.subcategorias where categoria = $1 and slug = $2", [categoria, slug])).rows[0]?.id;
const novoProduto = async (c, nome, categoria, extras = {}) =>
  (
    await c.q(
      `insert into public.produtos (nome, preco, "Categoria"${extras.atualizado_em ? ", atualizado_em" : ""}) values ($1, 10, $2${extras.atualizado_em ? ", $3" : ""}) returning id`,
      extras.atualizado_em ? [nome, categoria, extras.atualizado_em] : [nome, categoria]
    )
  ).rows[0].id;
const subDoProduto = async (c, id) => (await c.q("select subcategoria_id s from public.produtos where id = $1", [id])).rows[0].s;
const bloqueado = (r) => (!r.ok && r.code === SEM_PERMISSAO) || (r.ok && r.rowCount === 0);

await emTransacaoDesfeita("Subcategorias — banco (tabela, slug, ordem, chave composta, gatilho de limpeza, RLS)", async (db) => {
  const antesProdutos = (await db.query(SQL_MD5_PRODUTOS)).rows[0];
  const jaExistia = await existe(db);
  console.log(
    `\nProdutos: ${antesProdutos.n} linhas, md5 (id, nome, Categoria, atualizado_em) = ${antesProdutos.h}` +
      `\nEstado: tabela subcategorias ${jaExistia ? (comMigracao ? "existe (aplicada por --com-migracao nesta transação)" : "existe (já aplicada)") : "NÃO existe (o teste aplica a migração dentro da transação desfeita)"}.`
  );

  // --- ida e volta: migração e desfazer deixam o banco como estava ----------
  await cenario(db, async () => {
    if (!jaExistia) {
      const a0 = await assinatura(db);
      const m = await aplicar(db, MIGRACAO);
      const a1 = await assinatura(db);
      const d = await aplicar(db, DESFAZER);
      const a2 = await assinatura(db);
      const { n, h } = (await db.query(SQL_MD5_PRODUTOS)).rows[0];
      registrar("subcategorias 0a. migração aplica e o desfazer logo em seguida deixa a assinatura do banco idêntica à de antes", m.ok && d.ok && a0 === a2 && a1 !== a0, `migração: ${m.ok ? "ok" : m.message}; desfazer: ${d.ok ? "ok" : d.message}; igual a antes: ${a0 === a2}`);
      registrar("subcategorias 0b. depois da ida e volta a tabela sumiu e produtos tem o mesmo md5", (await existe(db)) === false && n === antesProdutos.n && h === antesProdutos.h, `tabela: ${(await existe(db)) ? "EXISTE" : "inexistente"}; md5 igual: ${h === antesProdutos.h}`);
    } else {
      const a0 = await assinatura(db);
      const d = await aplicar(db, DESFAZER);
      if (!d.ok) {
        pular("subcategorias 0a. desfazer e reaplicar deixam a assinatura igual", `desfazer recusou: ${d.message}`);
        return;
      }
      const semTabela = (await existe(db)) === false;
      const m = await aplicar(db, MIGRACAO);
      const a2 = await assinatura(db);
      registrar("subcategorias 0a. desfazer e migração de volta deixam a assinatura do banco idêntica", semTabela && m.ok && a0 === a2, `tabela sumiu após o desfazer: ${semTabela}; migração de volta: ${m.ok ? "ok" : m.message}; igual: ${a0 === a2}`);
    }
  });

  if (!jaExistia) {
    await rodarMigracao(db, MIGRACAO);
    console.log("Migração supabase/subcategorias.sql aplicada DENTRO da transação desfeita.");
  }
  const recemCriada = !jaExistia || MIGRACOES.some((a) => a === MIGRACAO);

  // --- semente --------------------------------------------------------------
  const { rows: semente } = await db.query(
    "select categoria::text || '|' || nome || '|' || slug || '|' || ordem l from public.subcategorias order by categoria::text, ordem"
  );
  const atual = semente.map((r) => r.l);
  const sementeIntacta = JSON.stringify(atual) === JSON.stringify(SEMENTE_ORDENADA);
  if (recemCriada || sementeIntacta) {
    registrar("subcategorias 1. semente: 21 linhas (Bolos 4, Doces 7, Salgados 4, Kit Festa 6), com nome, slug e ordem 10, 20, 30...", sementeIntacta, sementeIntacta ? "ok" : `diferente:\n${atual.join("\n")}`);
  } else {
    pular("subcategorias 1. semente intacta", "a tabela já foi editada depois da aplicação");
  }
  const contagens = (await db.query("select categoria::text c, count(*)::int n from public.subcategorias group by 1 order by 1")).rows;
  console.log(`       por categoria: ${contagens.map((r) => `${r.c}=${r.n}`).join(", ")} (total ${semente.length})`);

  // --- nome -----------------------------------------------------------------
  await cenario(db, async (c) => {
    const outraCaixa = await c.tentar("insert into public.subcategorias (categoria, nome) values ('Bolos', 'TRADICIONAL')");
    registrar("subcategorias 2a. nome repetido com outra caixa na mesma categoria é recusado (23505)", !outraCaixa.ok && outraCaixa.code === UNICO, descrever(outraCaixa));
    const outraCategoria = await c.tentar("insert into public.subcategorias (categoria, nome) values ('Salgados', 'Tradicional')");
    registrar("subcategorias 2b. o mesmo nome em outra categoria é aceito", outraCategoria.ok, descrever(outraCategoria));
    for (const [rotulo, nome] of [
      ["espaço nas pontas", " Sobra "],
      ["vazio", ""],
      ["81 caracteres", "x".repeat(81)],
    ]) {
      const r = await c.tentar("insert into public.subcategorias (categoria, nome) values ('Doces', $1)", [nome]);
      registrar(`subcategorias 2c. nome com ${rotulo} é recusado (23514)`, !r.ok && r.code === CHECK, descrever(r));
    }
    const oitenta = await c.tentar("insert into public.subcategorias (categoria, nome) values ('Doces', $1)", ["y".repeat(80)]);
    registrar("subcategorias 2d. nome com 80 caracteres é aceito", oitenta.ok, descrever(oitenta));
  });

  // --- slug -----------------------------------------------------------------
  await cenario(db, async (c) => {
    // Colisão só dentro da categoria. Com a semente intacta, 'fritos' já é de Salgados.
    await c.q("insert into public.subcategorias (categoria, nome) values ('Salgados', 'Fritos!')");
    await c.q("insert into public.subcategorias (categoria, nome) values ('Salgados', 'FRITOS?')");
    await c.q("insert into public.subcategorias (categoria, nome) values ('Bolos', 'Fritos')");
    await c.q("insert into public.subcategorias (categoria, nome) values ('Doces', 'Ação & Café')");
    const { rows } = await c.q(
      `select categoria::text c, nome, slug from public.subcategorias where nome in ('Fritos!', 'FRITOS?', 'Fritos', 'Ação & Café') order by c, nome`
    );
    const mapa = Object.fromEntries(rows.map((r) => [`${r.c}:${r.nome}`, r.slug]));
    if (recemCriada || sementeIntacta) {
      registrar(
        "subcategorias 3a. slug gerado pelo banco; colisão -2 e -3 só dentro da categoria; acento e símbolo normalizados",
        mapa["Salgados:Fritos!"] === "fritos-2" && mapa["Salgados:FRITOS?"] === "fritos-3" && mapa["Bolos:Fritos"] === "fritos" && mapa["Doces:Ação & Café"] === "acao-cafe",
        JSON.stringify(mapa)
      );
    } else {
      pular("subcategorias 3a. slugs com colisão contra a semente", "a semente foi editada");
    }
    const troca = await c.tentar("update public.subcategorias set slug = 'outro' where categoria = 'Bolos' and slug = 'fritos'");
    registrar("subcategorias 3b. trocar o slug é recusado (23514)", !troca.ok && troca.code === CHECK, descrever(troca));
    const igual = await c.tentar("update public.subcategorias set slug = 'fritos' where categoria = 'Bolos' and slug = 'fritos'");
    registrar("subcategorias 3c. reenviar o mesmo slug é aceito", igual.ok, descrever(igual));
    await c.q("update public.subcategorias set nome = 'Fritos (novo)' where categoria = 'Bolos' and slug = 'fritos'");
    const { rows: renomeada } = await c.q("select slug from public.subcategorias where categoria = 'Bolos' and nome = 'Fritos (novo)'");
    registrar("subcategorias 3d. renomear não mexe no slug", renomeada[0]?.slug === "fritos", `slug: ${renomeada[0]?.slug}`);
    const invalido = await c.tentar("insert into public.subcategorias (categoria, nome, slug) values ('Bolos', 'Zz', 'Maiusc ulo')");
    registrar("subcategorias 3e. slug enviado fora do formato é recusado (23514)", !invalido.ok && invalido.code === CHECK, descrever(invalido));
    const manual = await c.tentar("insert into public.subcategorias (categoria, nome, slug) values ('Bolos', 'Zz Manual', 'zz-manual')");
    const repetido = await c.tentar("insert into public.subcategorias (categoria, nome, slug) values ('Bolos', 'Zz Outro', 'zz-manual')");
    registrar("subcategorias 3f. slug enviado válido é aceito e repetido na categoria é recusado (23505)", manual.ok && !repetido.ok && repetido.code === UNICO, `${descrever(manual)}; repetido: ${descrever(repetido)}`);
  });

  // --- chave composta -------------------------------------------------------
  await cenario(db, async (c) => {
    const bolosTrad = await idDe(c, "Bolos", "tradicional");
    const docesGourmet = await idDe(c, "Doces", "gourmet");
    const p = await novoProduto(c, "zz Ensaio P1", "Doces");
    const errada = await c.tentar("update public.produtos set subcategoria_id = $1 where id = $2", [bolosTrad, p]);
    registrar("subcategorias 4a. produto de Doces com subcategoria de Bolos é recusado (23503)", !errada.ok && errada.code === CHAVE, descrever(errada));
    const certa = await c.tentar("update public.produtos set subcategoria_id = $1 where id = $2", [docesGourmet, p]);
    registrar("subcategorias 4b. produto de Doces com subcategoria de Doces é aceito", certa.ok && (await subDoProduto(c, p)) === docesGourmet, descrever(certa));
    const nova = await c.tentar(`insert into public.produtos (nome, preco, "Categoria", subcategoria_id) values ('zz Ensaio P3', 1, 'Doces', $1)`, [bolosTrad]);
    registrar("subcategorias 4c. cadastro de Doces já com subcategoria de Bolos é recusado (23503)", !nova.ok && nova.code === CHAVE, descrever(nova));
    const semSub = await c.tentar(`insert into public.produtos (nome, preco, "Categoria") values ('zz Ensaio P4', 1, 'Doces')`);
    registrar("subcategorias 4d. cadastro sem subcategoria continua aceito (subcategoria_id nulo)", semSub.ok, descrever(semSub));
  });

  // --- gatilho de limpeza ---------------------------------------------------
  await cenario(db, async (c) => {
    const bolosTrad = await idDe(c, "Bolos", "tradicional");
    const docesGourmet = await idDe(c, "Doces", "gourmet");
    const salgFritos = await idDe(c, "Salgados", "fritos");
    const p = await novoProduto(c, "zz Ensaio P1", "Doces");
    await c.q("update public.produtos set subcategoria_id = $1 where id = $2", [docesGourmet, p]);

    await c.q(`update public.produtos set "Categoria" = 'Bolos' where id = $1`, [p]);
    registrar("subcategorias limpeza (a). trocar a categoria sem tocar na subcategoria zera a subcategoria", (await subDoProduto(c, p)) === null, `subcategoria_id: ${await subDoProduto(c, p)}`);

    await c.q(`update public.produtos set "Categoria" = 'Doces', subcategoria_id = $1 where id = $2`, [docesGourmet, p]);
    await c.q(`update public.produtos set "Categoria" = 'Bolos', subcategoria_id = $1 where id = $2`, [bolosTrad, p]);
    registrar("subcategorias limpeza (b). trocar categoria e subcategoria no mesmo UPDATE mantém a nova", (await subDoProduto(c, p)) === bolosTrad, `subcategoria_id: ${await subDoProduto(c, p)}`);

    await c.q(`update public.produtos set "Categoria" = 'Doces', subcategoria_id = $1 where id = $2`, [docesGourmet, p]);
    await c.q(`update public.produtos set "Categoria" = 'Doces', preco = preco + 1 where id = $1`, [p]);
    registrar("subcategorias limpeza (c). UPDATE que reenvia a mesma categoria mantém a subcategoria", (await subDoProduto(c, p)) === docesGourmet, `subcategoria_id: ${await subDoProduto(c, p)}`);

    const cruzada = await c.tentar(`update public.produtos set "Categoria" = 'Bolos', subcategoria_id = $1 where id = $2`, [salgFritos, p]);
    registrar(
      "subcategorias limpeza (d). trocar a categoria informando subcategoria de outra categoria é recusado (23503) e o produto fica como estava",
      !cruzada.ok && cruzada.code === CHAVE && (await subDoProduto(c, p)) === docesGourmet,
      `${descrever(cruzada)}; subcategoria_id depois: ${await subDoProduto(c, p)}`
    );

    await c.q("update public.produtos set preco = preco + 1 where id = $1", [p]);
    registrar("subcategorias limpeza (d2). UPDATE sem citar a categoria mantém a subcategoria", (await subDoProduto(c, p)) === docesGourmet, `subcategoria_id: ${await subDoProduto(c, p)}`);

    await c.q(`update public.produtos set "Categoria" = 'Salgados' where id = $1`, [p]);
    const nula = await c.tentar(`update public.produtos set "Categoria" = 'Doces' where id = $1`, [p]);
    registrar("subcategorias limpeza (d3). subcategoria já nula e a categoria muda: segue nula, sem erro", nula.ok && (await subDoProduto(c, p)) === null, descrever(nula));
  });

  // --- gatilhos de produtos -------------------------------------------------
  {
    const { rows } = await db.query(
      `select tgname, tgenabled::text e from pg_trigger where tgrelid = 'public.produtos'::regclass and not tgisinternal order by tgname`
    );
    const nomes = rows.map((r) => r.tgname);
    const todosLigados = rows.every((r) => r.e === "O");
    const ordem = nomes.indexOf("produtos_set_atualizado_em") < nomes.indexOf("produtos_slug_imutavel");
    registrar(
      "subcategorias 6. produtos tem os 3 gatilhos antigos e o novo, todos ligados (tgenabled = O), na ordem em que disparam",
      rows.length === 4 && todosLigados && nomes.includes("produtos_limpa_subcategoria") && ordem,
      rows.map((r) => `${r.tgname}=${r.e}`).join(", ")
    );
  }

  // --- RLS ------------------------------------------------------------------
  await cenario(db, async (c) => {
    await c.q("update public.subcategorias set ativo = false where categoria = 'Kit Festa' and slug = 'outros'");
    const ativas = (await c.q("select count(*)::int n from public.subcategorias where ativo")).rows[0].n;
    const todas = (await c.q("select count(*)::int n from public.subcategorias")).rows[0].n;
    await c.como("anon");
    const le = await c.tentar("select count(*)::int n, count(*) filter (where not ativo)::int inativas from public.subcategorias");
    const insere = await c.tentar("insert into public.subcategorias (categoria, nome) values ('Bolos', 'Anon')");
    const altera = await c.tentar("update public.subcategorias set ordem = 1");
    const apaga = await c.tentar("delete from public.subcategorias");
    const trunca = await c.tentar("truncate public.subcategorias");
    await c.dono();
    const intacta = (await c.q("select count(*)::int n, count(*) filter (where ordem = 1)::int uns from public.subcategorias")).rows[0];
    registrar("subcategorias 7a. anônimo lê só as ativas", le.ok && le.rows[0].n === ativas && le.rows[0].inativas === 0, le.ok ? `viu ${le.rows[0].n} de ${todas} (ativas: ${ativas})` : descrever(le));
    registrar("subcategorias 7b. anônimo não insere, não altera, não apaga e não trunca", !insere.ok && bloqueado(altera) && bloqueado(apaga) && !trunca.ok && intacta.n === todas && intacta.uns === 0, `insert: ${descrever(insere)}; update: ${descrever(altera)}; delete: ${descrever(apaga)}; truncate: ${descrever(trunca)}`);

    await c.como("authenticated");
    const lê = await c.tentar("select count(*)::int n from public.subcategorias");
    const ins = await c.tentar("insert into public.subcategorias (categoria, nome, ordem) values ('Doces', 'Ensaio Auth', 99)");
    const upd = await c.tentar("update public.subcategorias set ordem = 98 where nome = 'Ensaio Auth'");
    const del = await c.tentar("delete from public.subcategorias where nome = 'Ensaio Auth'");
    const tru = await c.tentar("truncate public.subcategorias");
    await c.dono();
    registrar("subcategorias 7c. logado lê todas (inclusive inativas) e insere, altera e apaga subcategoria sem produto", lê.ok && lê.rows[0].n === todas && ins.ok && upd.ok && upd.rowCount === 1 && del.ok && del.rowCount === 1, `lê ${lê.ok ? lê.rows[0].n : descrever(lê)} de ${todas}; ${descrever(ins)}; ${descrever(upd)}; ${descrever(del)}`);
    registrar("subcategorias 7d. logado não trunca (42501)", !tru.ok && tru.code === SEM_PERMISSAO, descrever(tru));
  });

  // --- subcategoria em uso --------------------------------------------------
  await cenario(db, async (c) => {
    const docesGourmet = await idDe(c, "Doces", "gourmet");
    const p = await novoProduto(c, "zz Ensaio P1", "Doces");
    await c.q("update public.produtos set subcategoria_id = $1 where id = $2", [docesGourmet, p]);
    await c.como("authenticated");
    const apaga = await c.tentar("delete from public.subcategorias where id = $1", [docesGourmet]);
    const muda = await c.tentar("update public.subcategorias set categoria = 'Salgados' where id = $1", [docesGourmet]);
    const desativa = await c.tentar("update public.subcategorias set ativo = false where id = $1", [docesGourmet]);
    await c.dono();
    registrar("subcategorias 8a. apagar subcategoria com produto é recusado (23503)", !apaga.ok && apaga.code === CHAVE, descrever(apaga));
    registrar("subcategorias 8b. mudar a categoria de subcategoria em uso é recusado (23503)", !muda.ok && muda.code === CHAVE, descrever(muda));
    registrar("subcategorias 8c. desativar subcategoria em uso é permitido e o produto continua vinculado", desativa.ok && desativa.rowCount === 1 && (await subDoProduto(c, p)) === docesGourmet, descrever(desativa));
  });

  // --- ordem ----------------------------------------------------------------
  await cenario(db, async (c) => {
    const maxDoces = (await c.q("select max(ordem)::int m from public.subcategorias where categoria = 'Doces'")).rows[0].m ?? 0;
    const r = await c.tentar("insert into public.subcategorias (categoria, nome) values ('Doces', 'Zz Sem Ordem') returning ordem");
    registrar("subcategorias (e1). inserir sem ordem em Doces recebe o maior da categoria + 10", r.ok && r.rows[0].ordem === maxDoces + 10, r.ok ? `recebeu ${r.rows[0].ordem} (maior antes: ${maxDoces})` : descrever(r));
    if (recemCriada || sementeIntacta) {
      registrar("subcategorias (e2). com a semente intacta (Doces termina em 70) a nova recebe 80", r.ok && r.rows[0].ordem === 80, r.ok ? `recebeu ${r.rows[0].ordem}` : descrever(r));
    } else {
      pular("subcategorias (e2). nova em Doces recebe 80", "a semente foi editada");
    }
    const vazia = (await c.q("select count(*)::int n from public.subcategorias where categoria = 'Bebidas'")).rows[0].n === 0;
    if (vazia) {
      const b = await c.tentar("insert into public.subcategorias (categoria, nome) values ('Bebidas', 'Zz Bebida') returning ordem");
      registrar("subcategorias (e3). categoria sem subcategorias (Bebidas) recebe 10, e a categoria não tem trava", b.ok && b.rows[0].ordem === 10, b.ok ? `recebeu ${b.rows[0].ordem}` : descrever(b));
    } else {
      pular("subcategorias (e3). categoria sem subcategorias recebe 10", "Bebidas já tem subcategoria");
    }
    const seq = await c.tentar("insert into public.subcategorias (categoria, nome) values ('Doces', 'Zz Segunda') returning ordem");
    registrar("subcategorias (e4). a segunda sem ordem vem depois da primeira (+10)", seq.ok && seq.rows[0].ordem === maxDoces + 20, seq.ok ? `recebeu ${seq.rows[0].ordem}` : descrever(seq));

    const informada = await c.tentar("insert into public.subcategorias (categoria, nome, ordem) values ('Doces', 'Zz Informada', 5) returning ordem");
    registrar("subcategorias (f). inserir com ordem informada mantém o valor", informada.ok && informada.rows[0].ordem === 5, informada.ok ? `ficou ${informada.rows[0].ordem}` : descrever(informada));
    const zero = await c.tentar("insert into public.subcategorias (categoria, nome, ordem) values ('Doces', 'Zz Zero', 0) returning ordem");
    registrar("subcategorias (f2). ordem 0 é aceita", zero.ok && zero.rows[0].ordem === 0, zero.ok ? `ficou ${zero.rows[0].ordem}` : descrever(zero));
    const negativa = await c.tentar("insert into public.subcategorias (categoria, nome, ordem) values ('Doces', 'Zz Negativa', -1)");
    registrar("subcategorias (g). ordem negativa é recusada (23514)", !negativa.ok && negativa.code === CHECK, descrever(negativa));
    const { rows: col } = await c.q(
      "select column_default, is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'subcategorias' and column_name = 'ordem'"
    );
    registrar("subcategorias (g2). a coluna ordem é NOT NULL e não tem valor padrão", col[0]?.is_nullable === "NO" && col[0]?.column_default === null, JSON.stringify(col[0]));
  });

  // --- estrutura e permissões -----------------------------------------------
  {
    const fk = (await db.query("select pg_get_constraintdef(oid) d from pg_constraint where conname = 'produtos_subcategoria_fkey'")).rows[0]?.d;
    registrar(
      "subcategorias 9a. chave estrangeira composta (subcategoria_id, Categoria) com restrict em apagar e em mudar",
      /FOREIGN KEY \(subcategoria_id, "Categoria"\) REFERENCES subcategorias\(id, categoria\)/.test(fk ?? "") && /ON UPDATE RESTRICT/.test(fk) && /ON DELETE RESTRICT/.test(fk),
      fk ?? "não existe"
    );
    const { rows: pol } = await db.query("select count(*)::int n, (select relrowsecurity from pg_class where oid = 'public.subcategorias'::regclass) rls from pg_policy where polrelid = 'public.subcategorias'::regclass");
    registrar("subcategorias 9b. RLS ligada e cinco políticas", pol[0].rls === true && pol[0].n === 5, `RLS: ${pol[0].rls}; políticas: ${pol[0].n}`);
    const { rows: priv } = await db.query(
      `select r.papel,
         (select string_agg(left(p, 1), '' order by p) from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
            where has_table_privilege(r.papel, 'public.subcategorias', p)) letras
       from (values ('anon'), ('authenticated')) r(papel) order by 1`
    );
    const mapa = Object.fromEntries(priv.map((r) => [r.papel, r.letras]));
    registrar("subcategorias 9c. anônimo só lê; logado lê, insere, altera e apaga; ninguém trunca nem tem REFERENCES ou TRIGGER", mapa.anon === "S" && mapa.authenticated === "DISU", JSON.stringify(mapa));
    const { rows: fn } = await db.query(
      `select proname, prosecdef definer, proconfig::text cfg,
         has_function_privilege('anon', p.oid, 'EXECUTE') anon, has_function_privilege('authenticated', p.oid, 'EXECUTE') auth
       from pg_proc p where pronamespace = 'public'::regnamespace
         and proname in ('subcategoria_slug_livre', 'subcategorias_slug_no_cadastro', 'subcategorias_slug_imutavel', 'produtos_limpa_subcategoria') order by 1`
    );
    registrar(
      "subcategorias 9d. as 4 funções novas têm search_path fixo e ninguém da API executa",
      fn.length === 4 && fn.every((f) => !f.anon && !f.auth && /search_path/.test(f.cfg ?? "")),
      fn.map((f) => `${f.proname} anon=${f.anon} auth=${f.auth} definer=${f.definer}`).join(" | ")
    );
  }

  // --- PR 3 (admin): o que a tela e o servidor assumem do banco -------------
  // Tudo como o admin faz: papel authenticated, UPDATE com a coluna da categoria.
  await cenario(db, async (c) => {
    const docesGourmet = await idDe(c, "Doces", "gourmet");
    const bolosTrad = await idDe(c, "Bolos", "tradicional");
    const p = await novoProduto(c, "zz Ensaio PR3", "Doces");
    await c.q("update public.produtos set subcategoria_id = $1 where id = $2", [docesGourmet, p]);

    // (i1) O formulário troca a categoria e envia "Sem subcategoria" como null
    // explícito: o gatilho de limpeza não interfere (a subcategoria mudou no
    // mesmo UPDATE) e o produto fica sem subcategoria na categoria nova.
    await c.como("authenticated");
    const troca = await c.tentar(`update public.produtos set "Categoria" = 'Bolos', subcategoria_id = null where id = $1`, [p]);
    await c.dono();
    registrar(
      "subcategorias (i1). UPDATE com a categoria trocada e subcategoria_id null explícito, como logado, é aceito e deixa o produto sem subcategoria",
      troca.ok && troca.rowCount === 1 && (await subDoProduto(c, p)) === null,
      `${descrever(troca)}; subcategoria_id depois: ${await subDoProduto(c, p)}`
    );

    // (i1b) Mesmo UPDATE com a subcategoria da categoria nova: mantém a nova.
    await c.como("authenticated");
    const trocaCerta = await c.tentar(`update public.produtos set "Categoria" = 'Doces', subcategoria_id = $1 where id = $2`, [docesGourmet, p]);
    const trocaOutra = await c.tentar(`update public.produtos set "Categoria" = 'Bolos', subcategoria_id = $1 where id = $2`, [bolosTrad, p]);
    await c.dono();
    registrar(
      "subcategorias (i1b). trocar a categoria enviando a subcategoria da categoria nova, como logado, mantém a nova",
      trocaCerta.ok && trocaOutra.ok && (await subDoProduto(c, p)) === bolosTrad,
      `${descrever(trocaCerta)}; ${descrever(trocaOutra)}; subcategoria_id depois: ${await subDoProduto(c, p)}`
    );
  });

  await cenario(db, async (c) => {
    const docesGourmet = await idDe(c, "Doces", "gourmet");
    await c.q("update public.subcategorias set ativo = false where id = $1", [docesGourmet]);
    const p = await novoProduto(c, "zz Ensaio PR3 inativa", "Doces");

    // (i2) A chave composta não olha "ativo": o banco ACEITA ligar um produto a
    // uma subcategoria inativa. Quem recusa isso é a Server Action do produto
    // (salvo a subcategoria que o produto já tem). Este caso documenta o limite.
    await c.como("authenticated");
    const liga = await c.tentar("update public.produtos set subcategoria_id = $1 where id = $2", [docesGourmet, p]);
    const novo = await c.tentar(
      `insert into public.produtos (nome, preco, "Categoria", subcategoria_id) values ('zz Ensaio PR3 novo', 10, 'Doces', $1)`,
      [docesGourmet]
    );
    await c.dono();
    registrar(
      "subcategorias (i2). o banco aceita produto ligado a subcategoria INATIVA (a recusa é da Server Action, não do banco)",
      liga.ok && liga.rowCount === 1 && novo.ok && (await subDoProduto(c, p)) === docesGourmet,
      `${descrever(liga)}; ${descrever(novo)}`
    );
  });

  await cenario(db, async (c) => {
    const docesGourmet = await idDe(c, "Doces", "gourmet");
    const docesFinos = await idDe(c, "Doces", "finos");
    const contar = (id) => c.tentar("select count(*)::int n from public.produtos where subcategoria_id = $1", [id]);

    // O banco tem produtos reais ligados (carga de 13/10/2026): a prova é o
    // aumento da contagem, lida antes e depois na mesma transação.
    await c.como("authenticated");
    const gourmetAntes = await contar(docesGourmet);
    const finosAntes = await contar(docesFinos);
    await c.dono();
    const a = await novoProduto(c, "zz Ensaio PR3 contagem A", "Doces");
    const b = await novoProduto(c, "zz Ensaio PR3 contagem B", "Doces");
    await c.q("update public.produtos set subcategoria_id = $1 where id in ($2, $3)", [docesGourmet, a, b]);
    await c.q("update public.produtos set ativo = false where id = $1", [b]);

    // (i3) A contagem que a Server Action de apagar faz, como logado: conta
    // também o produto inativo (a RLS do logado enxerga todos).
    await c.como("authenticated");
    const gourmet = await contar(docesGourmet);
    const finos = await contar(docesFinos);
    await c.dono();
    const ok = gourmetAntes.ok && finosAntes.ok && gourmet.ok && finos.ok;
    registrar(
      "subcategorias (i3). a contagem de produtos por subcategoria, como logado, conta ativos e inativos (+2 e +0)",
      ok && gourmet.rows[0].n - gourmetAntes.rows[0].n === 2 && finos.rows[0].n - finosAntes.rows[0].n === 0,
      ok
        ? `Gourmet ${gourmetAntes.rows[0].n} -> ${gourmet.rows[0].n}; Finos ${finosAntes.rows[0].n} -> ${finos.rows[0].n}`
        : [gourmetAntes, finosAntes, gourmet, finos].map(descrever).join("; ")
    );
  });

  // --- produtos não mudam ---------------------------------------------------
  {
    const depois = (await db.query(SQL_MD5_PRODUTOS)).rows[0];
    registrar(
      "subcategorias (h). md5 de (id, nome, Categoria, atualizado_em) dos produtos é igual antes e depois do teste",
      depois.n === antesProdutos.n && depois.h === antesProdutos.h,
      `${antesProdutos.n} produtos: ${antesProdutos.h} -> ${depois.n} produtos: ${depois.h}`
    );
    const { rows } = await db.query("select count(*)::int n from public.produtos where subcategoria_id is not null");
    if (recemCriada || rows[0].n === 0) registrar("subcategorias (h2). nenhum produto tem subcategoria_id preenchido", rows[0].n === 0, `${rows[0].n} produto(s)`);
    else pular("subcategorias (h2). nenhum produto com subcategoria_id", "a carga dos produtos já foi feita");
  }
});
