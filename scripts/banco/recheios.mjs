// Catálogo de recheios (PR bolo-bento): tabela public.recheios, RLS,
// restrições de dados e os valores novos dos enums (categoria "Bento Cake",
// tipos "bolo" e "bento_cake"), numa transação desfeita — nada é gravado.
// Os recheios e produtos usados aqui são criados dentro da própria transação.
//
// Os valores novos dos enums só são testados se já existirem no banco: o
// Postgres não deixa usar um valor novo na mesma transação em que ele foi
// criado, então com --com-migracao=<arquivos dos enums> essa parte fica de
// fora (aviso, não falha) e roda de verdade depois de aplicada.
//
// Uso: node scripts/banco/recheios.mjs [--com-migracao=<arquivo.sql>[,<outro.sql>]]

import { cenario, descrever, emTransacaoDesfeita, registrar, SEM_PERMISSAO } from "./lib.mjs";

const INSERE = `insert into public.recheios (nome, vale_bolo, vale_bento, preco_kg, grupo, ativo) values ($1, $2, $3, $4, $5, $6) returning id`;
const bloqueado = (r) => (!r.ok && r.code === SEM_PERMISSAO) || (r.ok && r.rowCount === 0);

await emTransacaoDesfeita("Recheios — RLS, restrições e enums novos", async (db) => {
  // --- estrutura -----------------------------------------------------------
  await cenario(db, async (c) => {
    const { rows } = await c.q(
      `select column_name, data_type, is_nullable from information_schema.columns
       where table_schema = 'public' and table_name = 'recheios' order by ordinal_position`
    );
    const colunas = Object.fromEntries(rows.map((r) => [r.column_name, r]));
    registrar(
      "recheios 1. colunas: nome, vale_bolo, vale_bento, preco_kg (nulo), grupo (nulo), ativo",
      ["id", "nome", "vale_bolo", "vale_bento", "preco_kg", "grupo", "ativo", "criado_em", "atualizado_em"].every((n) => n in colunas) &&
        colunas.preco_kg?.is_nullable === "YES" &&
        colunas.grupo?.is_nullable === "YES" &&
        colunas.nome?.is_nullable === "NO",
      rows.map((r) => r.column_name).join(", ")
    );
    const { rows: rls } = await c.q("select relrowsecurity from pg_class where oid = 'public.recheios'::regclass");
    registrar("recheios 2. RLS ligada", rls[0]?.relrowsecurity === true, String(rls[0]?.relrowsecurity));
    const { rows: pol } = await c.q("select polname from pg_policy where polrelid = 'public.recheios'::regclass order by 1");
    registrar("recheios 3. cinco políticas (leitura anônima de ativo, leitura logada, insert, update, delete logados)", pol.length === 5, pol.map((p) => p.polname).join(" | "));
  });

  // --- anônimo -------------------------------------------------------------
  await cenario(db, async (c) => {
    await c.q(INSERE, ["PROVA Ativo", true, false, 50, "frutas", true]);
    await c.q(INSERE, ["PROVA Inativo", true, false, 60, "frutas", false]);
    await c.como("anon");
    const le = await c.tentar("select nome from public.recheios where nome like 'PROVA %' order by nome");
    const insere = await c.tentar(INSERE, ["PROVA Anon", true, false, 1, "frutas", true]);
    const altera = await c.tentar("update public.recheios set preco_kg = 1 where nome = 'PROVA Ativo'");
    const apaga = await c.tentar("delete from public.recheios where nome = 'PROVA Ativo'");
    const trunca = await c.tentar("truncate public.recheios");
    await c.dono();
    const { rows } = await c.q("select nome, preco_kg from public.recheios where nome like 'PROVA %' order by nome");
    registrar(
      "recheios 4. anônimo lê só o recheio ativo",
      le.ok && le.rows.length === 1 && le.rows[0].nome === "PROVA Ativo",
      le.ok ? `viu: ${le.rows.map((r) => r.nome).join(", ")}` : descrever(le)
    );
    registrar("recheios 5. anônimo não insere", !insere.ok, descrever(insere));
    registrar("recheios 6. anônimo não altera", bloqueado(altera) && rows.find((r) => r.nome === "PROVA Ativo")?.preco_kg === "50.00", descrever(altera));
    registrar("recheios 7. anônimo não apaga", bloqueado(apaga) && rows.length === 2, descrever(apaga));
    registrar("recheios 8. anônimo não trunca", !trunca.ok, descrever(trunca));
  });

  // --- logado ----------------------------------------------------------------
  await cenario(db, async (c) => {
    await c.q(INSERE, ["PROVA Inativo", true, false, 60, "frutas", false]);
    await c.como("authenticated");
    const le = await c.tentar("select nome from public.recheios where nome = 'PROVA Inativo'");
    const insere = await c.tentar(INSERE, ["PROVA Logado", true, true, 70, "chocolate_outros", true]);
    const altera = await c.tentar("update public.recheios set ativo = true where nome = 'PROVA Inativo'");
    const apaga = await c.tentar("delete from public.recheios where nome = 'PROVA Inativo'");
    const trunca = await c.tentar("truncate public.recheios");
    registrar("recheios 9. logado lê também o inativo", le.ok && le.rows.length === 1, descrever(le));
    registrar("recheios 10. logado insere", insere.ok && insere.rowCount === 1, descrever(insere));
    registrar("recheios 11. logado altera (desativar e reativar)", altera.ok && altera.rowCount === 1, descrever(altera));
    registrar("recheios 12. logado apaga pela API (o CMS nunca usa: só desativa)", apaga.ok && apaga.rowCount === 1, descrever(apaga));
    registrar("recheios 13. logado não trunca", !trunca.ok, descrever(trunca));
  });

  // --- restrições de dados ---------------------------------------------------------
  await cenario(db, async (c) => {
    const aceitos = [
      ["PROVA só Bolo", true, false, 80, "frutas"],
      ["PROVA só Bento", false, true, null, null],
      ["PROVA Os dois", true, true, 60, "chocolate_outros"],
    ];
    const resultados = [];
    for (const [nome, bolo, bento, preco, grupo] of aceitos) resultados.push([nome, await c.tentar(INSERE, [nome, bolo, bento, preco, grupo, true])]);
    registrar(
      "recheios 14. banco aceita só Bolo (com preço e grupo), só Bento (sem preço nem grupo) e os dois",
      resultados.every(([, r]) => r.ok),
      resultados.map(([n, r]) => `${n}: ${descrever(r)}`).join("; ")
    );
  });

  await cenario(db, async (c) => {
    const recusas = [
      ["não vale em lugar nenhum", ["PROVA X1", false, false, null, null]],
      ["Bolo sem preço", ["PROVA X2", true, false, null, "frutas"]],
      ["Bolo sem grupo", ["PROVA X3", true, false, 50, null]],
      ["Bolo com preço zero", ["PROVA X4", true, false, 0, "frutas"]],
      ["Bolo com preço negativo", ["PROVA X5", true, false, -5, "frutas"]],
      ["só Bento com preço", ["PROVA X6", false, true, 50, null]],
      ["só Bento com grupo", ["PROVA X7", false, true, null, "frutas"]],
      ["nome com espaço sobrando", [" PROVA X8", false, true, null, null]],
      ["nome vazio", ["", false, true, null, null]],
      ["nome com mais de 80 caracteres", ["x".repeat(81), false, true, null, null]],
    ];
    const resultados = [];
    for (const [rotulo, args] of recusas) resultados.push([rotulo, await c.tentar(INSERE, [...args, true])]);
    registrar(
      "recheios 15. banco recusa dado inconsistente (23514): sem lugar, Bolo sem preço/grupo/preço positivo, Bento com preço/grupo, nome fora do formato",
      resultados.every(([, r]) => !r.ok && r.code === "23514"),
      resultados.map(([n, r]) => `${n}: ${descrever(r)}`).join("; ")
    );
  });

  await cenario(db, async (c) => {
    await c.q(INSERE, ["PROVA Chocolate", true, true, 60, "chocolate_outros", true]);
    const igual = await c.tentar(INSERE, ["PROVA Chocolate", true, false, 60, "frutas", true]);
    const maiuscula = await c.tentar(INSERE, ["prova chocolate", false, true, null, null, true]);
    registrar("recheios 16. nome único, sem diferenciar maiúscula (não cadastra 'Chocolate' duas vezes)", !igual.ok && igual.code === "23505" && !maiuscula.ok && maiuscula.code === "23505", `${descrever(igual)}; ${descrever(maiuscula)}`);
  });

  // --- gatilho de atualizado_em ---------------------------------------------------
  await cenario(db, async (c) => {
    await c.q(
      `insert into public.recheios (nome, vale_bento, atualizado_em, criado_em) values ('PROVA Data', true, '2020-01-01', '2020-01-01')`
    );
    await c.q("update public.recheios set ativo = false where nome = 'PROVA Data'");
    const { rows } = await c.q("select atualizado_em, criado_em from public.recheios where nome = 'PROVA Data'");
    registrar(
      "recheios 17. todo update põe atualizado_em em dia; criado_em fica",
      rows[0].atualizado_em.getUTCFullYear() > 2020 && rows[0].criado_em.getUTCFullYear() === 2020,
      `${rows[0].atualizado_em.toISOString()} / ${rows[0].criado_em.toISOString()}`
    );
  });

  // --- enums novos ------------------------------------------------------------------
  await cenario(db, async (c) => {
    const lidos = await c.tentar(
      "select enum_range(null::public.categoria_produto)::text[] as categorias, enum_range(null::public.produto_tipo)::text[] as tipos"
    );
    if (!lidos.ok && lidos.code === "55P04") {
      console.log("\n[AVISO] Os valores novos dos enums foram criados nesta mesma transação: uso não testável na simulação (roda de verdade depois de aplicar).");
      return;
    }
    const { categorias, tipos } = lidos.rows[0];
    if (!categorias.includes("Bento Cake") || !tipos.includes("bolo") || !tipos.includes("bento_cake")) {
      console.log(`\n[AVISO] Enums ainda sem os valores novos (categoria: ${categorias.join(", ")}; tipo: ${tipos.join(", ")}): parte dos enums não testada.`);
      return;
    }
    registrar(
      "enums 1. categoria_produto ganhou Bento Cake (6 valores) e produto_tipo ganhou bolo e bento_cake (4 valores)",
      categorias.length === 6 && tipos.length === 4 && ["Bolos", "Doces", "Salgados", "Bebidas", "Kits"].every((v) => categorias.includes(v)) && ["normal", "cento"].every((v) => tipos.includes(v)),
      `categoria: ${categorias.join(", ")}; tipo: ${tipos.join(", ")}`
    );
    const nova = await c.tentar(
      `insert into public.produtos (nome, preco, pedido_minimo, tipo, ativo, "Categoria") values
       ('PROVA_BOLO', 0, 1, 'bolo', true, 'Bolos'), ('PROVA_BENTO', 60, 1, 'bento_cake', true, 'Bento Cake') returning nome`
    );
    if (!nova.ok && nova.code === "55P04") {
      console.log("\n[AVISO] O valor novo foi criado nesta mesma transação: uso não testável na simulação (roda de verdade depois de aplicar).");
      return;
    }
    registrar("enums 2. produtos aceita tipo bolo em Bolos e tipo bento_cake em Bento Cake", nova.ok && nova.rowCount === 2, descrever(nova));
    await c.como("anon");
    const anon = await c.tentar("select nome from public.produtos where nome in ('PROVA_BOLO', 'PROVA_BENTO') order by nome");
    registrar("enums 3. anônimo lê os produtos novos (RLS de ativo segue igual)", anon.ok && anon.rows.length === 2, descrever(anon));
  });
});
