// Categoria obrigatória do produto (supabase/produtos-categoria-obrigatoria.sql),
// numa transação desfeita — nada é gravado.
//
// Com a categoria obrigatória (aplicada no banco ou por --com-migracao),
// prova direto; sem ela, aplica a migração num cenário desfeito e prova o
// mesmo. Assim a bateria passa nos dois estados:
//   - cadastro sem categoria recusado (admin e chave de serviço);
//   - cadastro com cada um dos 6 valores do enum aceito;
//   - edição para categoria vazia recusada;
//   - cadastro e edição no formato do admin continuam funcionando;
//   - o desfazer volta a coluna a aceitar vazio, sem mexer em mais nada.
// Os testes que simulam o estado antigo (produto sem categoria) só rodam
// enquanto a coluna aceita vazio; com ela obrigatória, são pulados.
//
// Uso: node scripts/banco/categoria.mjs [--com-migracao=supabase/produtos-categoria-obrigatoria.sql]

import path from "node:path";
import { cenario, comMigracao, descrever, emTransacaoDesfeita, pular, raiz, registrar, rodarMigracao } from "./lib.mjs";

const MIGRACAO = path.join(raiz, "supabase", "produtos-categoria-obrigatoria.sql");
const DESFAZER = path.join(raiz, "supabase", "produtos-categoria-desfazer.sql");
const VIOLOU_NOT_NULL = "23502";
const VALORES = ["Bolos", "Bento Cake", "Doces", "Salgados", "Bebidas", "Kits"];
const MOTIVO = "categoria já é obrigatória (no banco ou por --com-migracao); simula o estado de antes dela";

async function categoriaAceitaVazio(db) {
  const { rows } = await db.query(
    `select is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'produtos' and column_name = 'Categoria'`
  );
  return rows[0].is_nullable === "YES";
}

// Cadastro e edição exatamente como o Salvar do admin
// (src/app/admin/produtos/actions.ts): colunas explícitas, sem slug.
function cadastrarComoAdmin(c, nome, categoria) {
  return c.tentar(
    `insert into public.produtos
       (id, nome, preco, descricao, pedido_minimo, "Categoria", unidade_venda, prazo_producao_dias, step_quantidade, destaque, ativo, tipo, image_url)
     values (gen_random_uuid(), $1, 10, null, 1, $2, null, 1, 'livre', false, true, 'normal', null)
     returning id`,
    [nome, categoria]
  );
}

function editarComoAdmin(c, nome, categoria) {
  return c.tentar(
    `update public.produtos set nome = $1, preco = 12, descricao = 'x', pedido_minimo = 1, "Categoria" = $2, unidade_venda = 'unidade',
       prazo_producao_dias = 1, step_quantidade = 'livre', destaque = true, ativo = true, tipo = 'normal'
     where nome = $1`,
    [nome, categoria]
  );
}

// Fotografia de public sem a nulidade de "Categoria": serve para provar
// que a migração e o desfazer só mexem nela.
async function estrutura(db) {
  const { rows } = await db.query(
    `select string_agg(table_name || '.' || column_name || ' ' || data_type || ' null=' || is_nullable || ' default=' || coalesce(column_default, ''), '|' order by table_name, column_name) s
     from information_schema.columns where table_schema = 'public' and not (table_name = 'produtos' and column_name = 'Categoria')`
  );
  const { rows: r2 } = await db.query(
    `select string_agg(conrelid::regclass || '.' || conname || ' ' || pg_get_constraintdef(oid), '|' order by conname) s
     from pg_constraint where connamespace = 'public'::regnamespace`
  );
  const { rows: r3 } = await db.query(
    `select count(*)::int n, md5(string_agg(to_jsonb(t)::text, '|' order by t.id)) s from public.produtos t`
  );
  return `${rows[0].s}#${r2[0].s}#${r3[0].n}:${r3[0].s}`;
}

// As provas da categoria obrigatória. Roda com a coluna já NOT NULL.
async function provar(db, c, antes) {
  // 1. cadastro sem categoria recusado
  await c.como("authenticated");
  const semAdmin = await c.tentar("insert into public.produtos (nome, preco, pedido_minimo) values ('PROVA Cat Sem', 1, 1)");
  await c.como("service_role");
  const semServico = await c.tentar("insert into public.produtos (nome, preco, pedido_minimo) values ('PROVA Cat Sem 2', 1, 1)");
  const nuloExplicito = await c.tentar("insert into public.produtos (nome, preco, pedido_minimo, \"Categoria\") values ('PROVA Cat Sem 3', 1, 1, null)");
  await c.dono();
  registrar(
    "categoria 1. cadastro sem categoria recusado (admin, chave de serviço e vazio explícito)",
    [semAdmin, semServico, nuloExplicito].every((r) => !r.ok && r.code === VIOLOU_NOT_NULL),
    `admin ${descrever(semAdmin)}; serviço ${descrever(semServico)}; vazio explícito ${descrever(nuloExplicito)}`
  );

  // 2. cada um dos 6 valores aceito
  const { rows: e } = await c.q("select enum_range(null::public.categoria_produto)::text[] v");
  await c.como("authenticated");
  const cadastros = [];
  for (const valor of VALORES) cadastros.push([valor, await cadastrarComoAdmin(c, `PROVA Cat ${valor}`, valor)]);
  await c.dono();
  registrar(
    "categoria 2. cadastro com cada um dos 6 valores do enum aceito",
    e[0].v.length === 6 && VALORES.every((v) => e[0].v.includes(v)) && cadastros.every(([, r]) => r.ok && r.rowCount === 1),
    `enum: ${e[0].v.join(", ")}; ${cadastros.map(([v, r]) => `${v} ${r.ok ? "aceito" : descrever(r)}`).join("; ")}`
  );

  // 3. edição para vazio recusada; 4. edição no formato do admin funciona
  await c.como("authenticated");
  const paraNulo = await c.tentar(`update public.produtos set "Categoria" = null where nome = 'PROVA Cat Doces'`);
  const edicao = await editarComoAdmin(c, "PROVA Cat Doces", "Salgados");
  const toggle = await c.tentar("update public.produtos set ativo = false where nome = 'PROVA Cat Doces'");
  await c.dono();
  const { rows: p } = await c.q(`select "Categoria", ativo, unidade_venda from public.produtos where nome = 'PROVA Cat Doces'`);
  registrar(
    "categoria 3. edição para categoria vazia recusada",
    !paraNulo.ok && paraNulo.code === VIOLOU_NOT_NULL,
    descrever(paraNulo)
  );
  registrar(
    "categoria 4. cadastro e edição no formato do admin continuam funcionando (inclusive o liga/desliga da lista)",
    cadastros.every(([, r]) => r.ok) && edicao.ok && edicao.rowCount === 1 && toggle.ok && p[0]?.Categoria === "Salgados" && p[0]?.ativo === false && p[0]?.unidade_venda === "unidade",
    `edição ${descrever(edicao)}; liga/desliga ${descrever(toggle)}; depois: ${p[0]?.Categoria}, ativo ${p[0]?.ativo}, ${p[0]?.unidade_venda}`
  );

  // 5. desfazer: só a nulidade da coluna muda
  await c.q("delete from public.produtos where nome like 'PROVA Cat %'");
  await rodarMigracao(db, DESFAZER);
  const aceita = await categoriaAceitaVazio(db);
  const depois = await estrutura(db);
  registrar(
    "categoria 5. desfazer: \"Categoria\" volta a aceitar vazio e nada mais muda (colunas, restrições, produtos)",
    aceita && depois === antes,
    `aceita vazio: ${aceita}; resto ${depois === antes ? "igual" : "MUDOU"}`
  );
}

await emTransacaoDesfeita("Categoria obrigatória do produto", async (db) => {
  const aceitaVazio = await categoriaAceitaVazio(db);
  console.log(
    aceitaVazio
      ? "\n\"Categoria\" aceita vazio no banco: a migração é aplicada num cenário desfeito para as provas."
      : `\n"Categoria" já é obrigatória${comMigracao ? " (--com-migracao)" : " no banco"}: provas direto; testes do estado antigo pulados.`
  );

  const { rows: semCat } = await db.query(`select count(*)::int n from public.produtos where "Categoria" is null`);
  registrar("categoria 0. nenhum produto real sem categoria (a migração não cancela)", semCat[0].n === 0, `${semCat[0].n} sem categoria`);

  await cenario(db, async (c) => {
    // A fotografia de "antes" é do estado sem a migração: tirada antes de
    // aplicá-la (quando falta) ou depois de desfazê-la num savepoint.
    let antes;
    if (aceitaVazio) {
      antes = await estrutura(db);
      await rodarMigracao(db, MIGRACAO);
    } else {
      await c.q("savepoint foto");
      await rodarMigracao(db, DESFAZER);
      antes = await estrutura(db);
      await c.q("rollback to savepoint foto");
    }
    await provar(db, c, antes);
  });

  // Estado antigo: só enquanto a coluna aceita vazio.
  if (!aceitaVazio) {
    pular("categoria 6.", `${MOTIVO} (cadastro sem categoria aceito)`);
    pular("categoria 7.", `${MOTIVO} (migração cancela com produto sem categoria)`);
    return;
  }
  await cenario(db, async (c) => {
    await c.como("authenticated");
    const sem = await c.tentar("insert into public.produtos (nome, preco, pedido_minimo) values ('PROVA Cat Antigo', 1, 1)");
    registrar("categoria 6. hoje, sem a migração, o banco ainda aceita produto sem categoria (só o formulário exige)", sem.ok, descrever(sem));
  });
  await cenario(db, async (c) => {
    await c.q("insert into public.produtos (nome, preco, pedido_minimo) values ('PROVA Cat Antigo', 1, 1)");
    let r;
    await c.q("savepoint migracao");
    try {
      await rodarMigracao(db, MIGRACAO);
      await c.q("release savepoint migracao");
      r = { ok: true };
    } catch (erro) {
      await c.q("rollback to savepoint migracao");
      r = { ok: false, message: erro.message };
    }
    const aindaAceita = await categoriaAceitaVazio(db);
    registrar(
      "categoria 7. a migração se cancela inteira se existir produto sem categoria",
      !r.ok && /sem categoria/.test(r.message) && aindaAceita,
      r.ok ? "aplicou (ERRADO)" : `recusada: ${r.message}; coluna continua aceitando vazio: ${aindaAceita}`
    );
  });
});
