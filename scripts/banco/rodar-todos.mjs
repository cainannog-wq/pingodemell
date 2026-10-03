// Roda todos os testes de scripts/banco/ e prova que nada foi gravado:
// fotografa o banco antes e depois (linhas e conteúdo de cada tabela de
// public, contagens de storage e auth, o valor de cada contador, e as
// permissões, políticas e funções de public) e compara. Qualquer diferença
// faz o comando falhar.
//
// A fotografia é tirada numa conexão só de leitura.
//
// Uso: node scripts/banco/rodar-todos.mjs [--com-migracao=<arquivo.sql>]
//   --com-migracao=... é repassado aos testes de banco (ver lib.mjs), menos
//   à slug-migracao.mjs, que aplica a etapa 1 do slug sozinha quando ela
//   falta. O teste HTTP sempre olha o estado real de produção.

import { spawnSync } from "node:child_process";
import path from "node:path";
import { conectar, raiz } from "./lib.mjs";

const TESTES_DE_BANCO = [
  "permissoes.mjs",
  "produtos.mjs",
  "produto-cento-itens.mjs",
  "recheios.mjs",
  "dias-off.mjs",
  "pedidos.mjs",
  "permissoes-pedidos.mjs",
  "gravacao-pedidos.mjs",
  "slug.mjs",
  "unidade-venda-kits.mjs",
  "categoria.mjs",
  "exclusao-dados.mjs",
];
// Aplica a própria migração quando ela falta; não recebe --com-migracao.
const TESTES_SEM_ARGUMENTO = ["slug-migracao.mjs"];
const TESTE_HTTP = "http-sem-gravar.mjs";
const argMigracao = process.argv.find((a) => a.startsWith("--com-migracao"));
const comMigracao = Boolean(argMigracao);

async function fotografar() {
  const db = await conectar();
  try {
    await db.query("begin transaction read only");
    const foto = {};
    const { rows: tabelas } = await db.query(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('r', 'p') order by 1`
    );
    for (const { relname } of tabelas) {
      const { rows } = await db.query(
        `select count(*)::int n, coalesce(md5(string_agg(t::text, '|' order by t::text)), '-') assinatura
         from public.${JSON.stringify(relname)} t`
      );
      foto[`public.${relname}`] = `${rows[0].n} linha(s), conteúdo ${rows[0].assinatura.slice(0, 10)}`;
    }
    // Rotina de exclusão (supabase/exclusao-dados.sql): registro e job, se já
    // existirem.
    const { rows: extras } = await db.query(
      `select to_regclass('privado.exclusao_registro') is not null registro, to_regclass('cron.job') is not null cron`
    );
    if (extras[0].registro) {
      const { rows } = await db.query(
        `select count(*)::int n, coalesce(md5(string_agg(t::text, '|' order by t::text)), '-') assinatura from privado.exclusao_registro t`
      );
      foto["privado.exclusao_registro"] = `${rows[0].n} linha(s), conteúdo ${rows[0].assinatura.slice(0, 10)}`;
    }
    if (extras[0].cron) {
      const { rows } = await db.query(
        `select count(*)::int n, coalesce(md5(string_agg(jobname || schedule || command || active, '|' order by jobid)), '-') assinatura from cron.job`
      );
      foto["cron.job"] = `${rows[0].n} job(s), conteúdo ${rows[0].assinatura.slice(0, 10)}`;
    }
    for (const tabela of ["storage.buckets", "storage.objects", "auth.users", "auth.identities", "auth.sessions", "auth.refresh_tokens", "auth.audit_log_entries"]) {
      const { rows } = await db.query(`select count(*)::int n from ${tabela}`);
      foto[tabela] = `${rows[0].n} linha(s)`;
    }
    const { rows: contadores } = await db.query(
      `select schemaname || '.' || sequencename nome, last_value from pg_sequences where schemaname = 'public' order by 1`
    );
    for (const { nome, last_value } of contadores) foto[`contador ${nome}`] = `último valor ${last_value}`;
    // Estrutura de acesso: permissões de tabela e de coluna, políticas e
    // funções (definição e permissões) de public.
    const { rows: acesso } = await db.query(
      `select
         (select md5(string_agg(c.relname || coalesce(c.relacl::text, '-'), '|' order by c.relname))
            from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm')) tabelas,
         (select coalesce(md5(string_agg(a.attrelid::regclass::text || a.attname || a.attacl::text, '|' order by a.attrelid::regclass::text, a.attname)), '-')
            from pg_attribute a join pg_class c on c.oid = a.attrelid
            where c.relnamespace = 'public'::regnamespace and a.attacl is not null) colunas,
         (select md5(string_agg(polrelid::regclass::text || polname || polcmd::text || polroles::text || coalesce(pg_get_expr(polqual, polrelid), '') || coalesce(pg_get_expr(polwithcheck, polrelid), ''), '|' order by polrelid::regclass::text, polname))
            from pg_policy p join pg_class c on c.oid = p.polrelid where c.relnamespace = 'public'::regnamespace) politicas,
         (select count(*)::int || ' função(ões), ' || md5(string_agg(p.oid::regprocedure::text || coalesce(p.proacl::text, '-') || md5(pg_get_functiondef(p.oid)), '|' order by p.oid::regprocedure::text))
            from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f') funcoes`
    );
    foto["permissões das tabelas de public"] = acesso[0].tabelas.slice(0, 10);
    foto["permissões por coluna em public"] = acesso[0].colunas.slice(0, 10);
    foto["políticas de public"] = acesso[0].politicas.slice(0, 10);
    foto["funções de public"] = acesso[0].funcoes.replace(/[0-9a-f]{32}$/, (m) => m.slice(0, 10));
    return foto;
  } finally {
    await db.query("rollback").catch(() => {});
    await db.end();
  }
}

function rodar(arquivo, args) {
  console.log(`\n${"#".repeat(70)}\n# node scripts/banco/${arquivo} ${args.join(" ")}\n${"#".repeat(70)}`);
  // A saída passa adiante como está e é lida para contar os testes pulados
  // (linhas "[----] ... pulado:", ver pular() em lib.mjs).
  const r = spawnSync(process.execPath, [path.join(raiz, "scripts", "banco", arquivo), ...args], {
    stdio: ["inherit", "pipe", "inherit"],
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  process.stdout.write(r.stdout ?? "");
  const pulados = (r.stdout ?? "").split(/\r?\n/).filter((l) => l.startsWith("[----]")).map((l) => l.slice(7));
  return { ok: r.status === 0, pulados };
}

const antes = await fotografar();

const resultados = [];
for (const arquivo of TESTES_DE_BANCO) resultados.push([arquivo, rodar(arquivo, comMigracao ? [argMigracao] : [])]);
for (const arquivo of TESTES_SEM_ARGUMENTO) resultados.push([arquivo, rodar(arquivo, [])]);
resultados.push([TESTE_HTTP, rodar(TESTE_HTTP, [])]);

const depois = await fotografar();

console.log(`\n${"=".repeat(70)}\nFotografia do banco antes e depois de rodar tudo\n${"=".repeat(70)}`);
let mudou = false;
for (const chave of new Set([...Object.keys(antes), ...Object.keys(depois)])) {
  const igual = antes[chave] === depois[chave];
  if (!igual) mudou = true;
  console.log(`${igual ? "igual  " : "MUDOU! "} ${chave.padEnd(34)} antes: ${antes[chave] ?? "-"}${igual ? "" : ` | depois: ${depois[chave] ?? "-"}`}`);
}

console.log(`\n${"=".repeat(70)}\nResultado por script${comMigracao ? " (testes de banco com a migração aplicada DENTRO da transação desfeita)" : ""}\n${"=".repeat(70)}`);
for (const [arquivo, { ok, pulados }] of resultados) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${arquivo}${pulados.length ? ` (${pulados.length} pulado(s))` : ""}`);
}
const todosPulados = resultados.flatMap(([arquivo, { pulados }]) => pulados.map((p) => `${arquivo}: ${p}`));
console.log(`\nPulados: ${todosPulados.length}${todosPulados.length ? "\n  - " + todosPulados.join("\n  - ") : ""}`);
console.log(mudou ? "\nFALHA: o banco mudou." : "\nBanco idêntico antes e depois: nada foi gravado.");

if (mudou || resultados.some(([, r]) => !r.ok)) process.exitCode = 1;
