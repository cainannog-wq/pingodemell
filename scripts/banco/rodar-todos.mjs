// Roda todos os testes de scripts/banco/ e prova que nada foi gravado:
// fotografa o banco antes e depois (linhas e conteúdo de cada tabela de
// public, contagens de storage e auth, e o valor de cada contador) e
// compara. Qualquer diferença faz o comando falhar.
//
// A fotografia é tirada numa conexão só de leitura.
//
// Uso: node scripts/banco/rodar-todos.mjs [--com-migracao]
//   --com-migracao é repassado aos testes de banco (ver lib.mjs). O teste
//   HTTP sempre olha o estado real de produção.

import { spawnSync } from "node:child_process";
import path from "node:path";
import { conectar, raiz } from "./lib.mjs";

const TESTES_DE_BANCO = [
  "permissoes.mjs",
  "produtos.mjs",
  "produto-cento-itens.mjs",
  "dias-off.mjs",
  "pedidos.mjs",
  "limite-pedidos.mjs",
];
const TESTE_HTTP = "http-sem-gravar.mjs";
const comMigracao = process.argv.includes("--com-migracao");

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
    for (const tabela of ["storage.buckets", "storage.objects", "auth.users", "auth.identities", "auth.sessions", "auth.refresh_tokens", "auth.audit_log_entries"]) {
      const { rows } = await db.query(`select count(*)::int n from ${tabela}`);
      foto[tabela] = `${rows[0].n} linha(s)`;
    }
    const { rows: contadores } = await db.query(
      `select schemaname || '.' || sequencename nome, last_value from pg_sequences where schemaname = 'public' order by 1`
    );
    for (const { nome, last_value } of contadores) foto[`contador ${nome}`] = `último valor ${last_value}`;
    return foto;
  } finally {
    await db.query("rollback").catch(() => {});
    await db.end();
  }
}

function rodar(arquivo, args) {
  console.log(`\n${"#".repeat(70)}\n# node scripts/banco/${arquivo} ${args.join(" ")}\n${"#".repeat(70)}`);
  const r = spawnSync(process.execPath, [path.join(raiz, "scripts", "banco", arquivo), ...args], { stdio: "inherit" });
  return r.status === 0;
}

const antes = await fotografar();

const resultados = [];
for (const arquivo of TESTES_DE_BANCO) resultados.push([arquivo, rodar(arquivo, comMigracao ? ["--com-migracao"] : [])]);
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
for (const [arquivo, ok] of resultados) console.log(`${ok ? "PASS" : "FAIL"}  ${arquivo}`);
console.log(mudou ? "\nFALHA: o banco mudou." : "\nBanco idêntico antes e depois: nada foi gravado.");

if (mudou || resultados.some(([, ok]) => !ok)) process.exitCode = 1;
