// Renomeação 'Kits' -> 'Kit Festa' do enum categoria_produto
// (supabase/categoria-kit-festa.sql e o desfazer), em transação desfeita —
// nada é gravado. Funciona nos dois estados do banco:
//   - com o valor ainda 'Kits': aplica a migração e depois o desfazer;
//   - com o valor já 'Kit Festa': aplica o desfazer e depois a migração.
// Provas, nos dois sentidos:
//   1. o enum troca o nome e só ele (um valor, sem sobra do nome antigo);
//   2. nenhuma linha de produtos é reescrita: o xmin e o conteúdo (menos o
//      nome da categoria) são os mesmos, então nenhum gatilho dispara e o
//      atualizado_em de cada produto fica intacto;
//   3. a contagem por categoria é a mesma (a de kits só muda de rótulo), e o
//      filtro do anônimo pelo nome novo acha os mesmos produtos ativos;
//   4. ida e volta deixam o banco exatamente como estava;
//   5. a migração se cancela se o estado não é o esperado (aplicar duas vezes);
//   6. o arquivo do sentido contrário se cancela no estado atual;
//   7. gravar o nome que o banco ainda não conhece (o Salvar do admin novo
//      antes do RENAME, ou o do antigo depois) é recusado como valor inválido
//      do enum e não grava nada.
//
// Uso: node scripts/banco/kit-festa-migracao.mjs
// (não usa --com-migracao: aplica os dois arquivos sozinho)

import path from "node:path";
import { cenario, descrever, emTransacaoDesfeita, nomeDaCategoriaKit, raiz, registrar, rodarMigracao } from "./lib.mjs";

const MIGRACAO = path.join(raiz, "supabase", "categoria-kit-festa.sql");
const DESFAZER = path.join(raiz, "supabase", "categoria-kit-festa-desfazer.sql");

// Fotografia de produtos: o conteúdo sem a categoria (e o xmin, que muda se
// a linha for reescrita), mais a categoria por produto e o resumo por nome.
async function fotografar(db, kit) {
  const { rows } = await db.query(
    `select count(*)::int n,
            md5(string_agg((to_jsonb(t) - 'Categoria')::text || '|' || t.xmin::text, ',' order by t.id)) conteudo,
            md5(string_agg(t.id::text || '=' || replace(t."Categoria"::text, $1, 'KIT'), ',' order by t.id)) categorias,
            count(*) filter (where t."Categoria"::text = $1)::int kits,
            count(*) filter (where t."Categoria"::text = $1 and t.ativo)::int kits_ativos
     from public.produtos t`,
    [kit]
  );
  return rows[0];
}

async function aplicar(db, arquivo) {
  await db.query("savepoint migracao");
  try {
    await rodarMigracao(db, arquivo);
    await db.query("release savepoint migracao");
    return { ok: true };
  } catch (erro) {
    await db.query("rollback to savepoint migracao");
    return { ok: false, message: erro.message };
  }
}

async function valoresDoEnum(db) {
  const { rows } = await db.query(
    `select string_agg(e.enumlabel, ',' order by e.enumsortorder) v
     from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'categoria_produto'`
  );
  return rows[0].v;
}

await emTransacaoDesfeita("Renomeação Kits -> Kit Festa", async (db) => {
  const atual = await nomeDaCategoriaKit(db);
  const outro = atual === "Kits" ? "Kit Festa" : "Kits";
  const ida = atual === "Kits" ? MIGRACAO : DESFAZER;
  const volta = atual === "Kits" ? DESFAZER : MIGRACAO;
  console.log(`\nO enum está com '${atual}': a prova aplica ${atual === "Kits" ? "a migração e depois o desfazer" : "o desfazer e depois a migração"}.`);

  await cenario(db, async (c) => {
    const antes = await fotografar(db, atual);
    const valoresAntes = await valoresDoEnum(db);
    await c.como("anon");
    const anonAntes = await c.tentar(`select count(*)::int n from public.produtos where "Categoria"::text = $1 and ativo`, [atual]);
    await c.dono();

    const r1 = await aplicar(db, ida);
    const meio = await fotografar(db, outro);
    const valoresMeio = await valoresDoEnum(db);
    await c.como("anon");
    const anonMeio = await c.tentar(`select count(*)::int n from public.produtos where "Categoria"::text = $1 and ativo`, [outro]);
    await c.dono();

    registrar(
      `kit-festa 1. o enum troca '${atual}' por '${outro}' e só isso`,
      r1.ok && valoresMeio === valoresAntes.replace(atual, outro) && !valoresMeio.split(",").includes(atual),
      r1.ok ? `antes: ${valoresAntes}; depois: ${valoresMeio}` : `migração recusada: ${r1.message}`
    );
    registrar(
      "kit-festa 2. nenhuma linha de produtos foi reescrita (conteúdo e xmin iguais: nenhum gatilho, atualizado_em intacto)",
      r1.ok && meio.n === antes.n && meio.conteudo === antes.conteudo,
      `${antes.n} produtos; conteúdo ${meio.conteudo === antes.conteudo ? "igual" : "MUDOU"}`
    );
    registrar(
      "kit-festa 3. a categoria de cada produto é a mesma (só o rótulo muda) e o anônimo acha os mesmos kits ativos pelo nome novo",
      meio.categorias === antes.categorias && meio.kits === antes.kits && anonAntes.ok && anonMeio.ok && anonMeio.rows[0].n === anonAntes.rows[0].n,
      `kits ${antes.kits} -> ${meio.kits}; ativos pelo anônimo ${anonAntes.rows?.[0]?.n} -> ${anonMeio.rows?.[0]?.n}`
    );

    // 5. aplicar a mesma migração de novo se cancela (o valor de origem não existe mais)
    const repetida = await aplicar(db, ida);
    registrar(
      "kit-festa 5. aplicar a mesma migração duas vezes se cancela, sem mudar nada",
      !repetida.ok && /nada a (renomear|desfazer)|já tem o valor/.test(repetida.message) && (await valoresDoEnum(db)) === valoresMeio,
      repetida.ok ? "aplicou de novo (ERRADO)" : `recusada: ${repetida.message}`
    );

    const r2 = await aplicar(db, volta);
    const depois = await fotografar(db, atual);
    const valoresDepois = await valoresDoEnum(db);
    registrar(
      "kit-festa 4. ida e volta deixam o enum e os produtos exatamente como estavam",
      r2.ok && valoresDepois === valoresAntes && depois.conteudo === antes.conteudo && depois.categorias === antes.categorias && depois.kits === antes.kits,
      r2.ok ? `enum ${valoresDepois}; conteúdo ${depois.conteudo === antes.conteudo ? "igual" : "MUDOU"}` : `volta recusada: ${r2.message}`
    );
  });

  // O nome de destino existe e o nome de origem não: o arquivo do outro
  // sentido não tem o que fazer e cancela.
  await cenario(db, async () => {
    const errado = await aplicar(db, volta);
    registrar(
      "kit-festa 6. o arquivo do sentido contrário se cancela no estado atual",
      !errado.ok && /nada a (renomear|desfazer)/.test(errado.message),
      errado.ok ? "aplicou (ERRADO)" : `recusada: ${errado.message}`
    );
  });
});

await emTransacaoDesfeita("Salvar com o nome da categoria que o banco não conhece", async (db) => {
  const atual = await nomeDaCategoriaKit(db);
  const outro = atual === "Kits" ? "Kit Festa" : "Kits";
  await cenario(db, async (c) => {
    await c.q("insert into public.produtos (nome, preco, pedido_minimo, \"Categoria\", tipo, ativo) values ('PROVA Kit Festa', 1, 1, $1, 'normal', true)", [atual]);
    const { rows: antes } = await c.q("select md5(to_jsonb(t)::text) s from public.produtos t where nome = 'PROVA Kit Festa'");
    await c.como("authenticated");
    const edicao = await c.tentar("update public.produtos set preco = 2, \"Categoria\" = $1 where nome = 'PROVA Kit Festa'", [outro]);
    const cadastro = await c.tentar("insert into public.produtos (nome, preco, pedido_minimo, \"Categoria\", tipo, ativo) values ('PROVA Kit Festa 2', 1, 1, $1, 'normal', true)", [outro]);
    await c.dono();
    const { rows: depois } = await c.q("select md5(to_jsonb(t)::text) s from public.produtos t where nome = 'PROVA Kit Festa'");
    const { rows: novo } = await c.q("select count(*)::int n from public.produtos where nome = 'PROVA Kit Festa 2'");
    registrar(
      `kit-festa 7. Salvar com '${outro}' (nome que o banco não tem) é recusado e não grava nada`,
      !edicao.ok && edicao.code === "22P02" && !cadastro.ok && cadastro.code === "22P02" && antes[0].s === depois[0].s && novo[0].n === 0,
      `edição ${descrever(edicao)}; cadastro ${descrever(cadastro)}; linha ${antes[0].s === depois[0].s ? "intacta" : "MUDOU"}`
    );
  });
});
