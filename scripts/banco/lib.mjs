// Base dos testes de banco que NUNCA gravam em produção.
//
// Cada script conecta direto no Postgres (SUPABASE_DB_URL do .env.local,
// Session pooler), abre UMA transação e faz ROLLBACK no fim, sempre — não
// existe COMMIT em nenhum caminho. Se o processo cair no meio, a conexão
// fecha e o próprio Postgres desfaz a transação aberta.
//
// Dentro da transação, cada cenário roda num SAVEPOINT desfeito ao final,
// e o papel da API é simulado do mesmo jeito que o PostgREST faz: SET LOCAL
// ROLE anon | authenticated | service_role + request.jwt.claims. Assim a
// prova vale para as políticas, permissões e gatilhos que estão DE FATO em
// produção, não só para os arquivos .sql do repositório. O que não passa por
// aqui é a camada HTTP — ela é coberta por scripts/banco/http-sem-gravar.mjs,
// com chamadas que nunca gravam.
//
// --com-migracao: roda supabase/seguranca-api.sql dentro da mesma
// transação desfeita, antes das verificações. Serve para provar uma
// migração antes de aplicá-la. Depois de aplicada em produção, rode sem.
//
// Único efeito que um ROLLBACK não desfaz: contadores (sequences). Nenhum
// cenário aqui usa o contador real de número de pedido — a gravação de
// pedido é provada numa cópia temporária da tabela, com contador próprio.
// scripts/banco/rodar-todos.mjs confere isso (last_value igual antes e depois).
//
// Segurança do segredo: SUPABASE_DB_URL dá acesso total ao banco. Nunca é
// impressa; mensagens de erro passam por limpar() antes de aparecer.

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

export const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const MIGRACAO = path.join(raiz, "supabase", "seguranca-api.sql");
// Certificado da autoridade da Supabase (público). SUPABASE_DB_CA troca o
// arquivo — serve para provar que um certificado errado é recusado.
const CERTIFICADO = process.env.SUPABASE_DB_CA || path.join(raiz, "supabase", "prod-ca.crt");

// Usuário "logado" simulado. As políticas deste projeto só olham o papel
// (authenticated), não o id do usuário, então qualquer uuid serve.
const SUB_LOGADO = "00000000-0000-4000-8000-00000000a0a0";

export function lerEnv() {
  const arquivo = path.join(raiz, ".env.local");
  const env = {};
  if (existsSync(arquivo)) {
    for (const linha of readFileSync(arquivo, "utf8").split(/\r?\n/)) {
      const t = linha.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq === -1) continue;
      env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
    }
  }
  return { ...env, ...process.env };
}

const env = lerEnv();
const segredos = [env.SUPABASE_DB_URL, env.SUPABASE_SERVICE_ROLE_KEY, env.SUPABASE_ANON_KEY].filter(Boolean);
try {
  const u = new URL(env.SUPABASE_DB_URL);
  if (u.password) segredos.push(u.password, decodeURIComponent(u.password));
} catch {
  // URL ausente ou inválida: conectar() avisa.
}

export function limpar(texto) {
  let s = String(texto);
  for (const segredo of segredos) s = s.split(segredo).join("[segredo]");
  return s;
}

export const comMigracao = process.argv.includes("--com-migracao");

export async function conectar() {
  if (!env.SUPABASE_DB_URL) {
    console.error("Falta SUPABASE_DB_URL no .env.local (conexão Session pooler do painel da Supabase).");
    process.exit(1);
  }
  if (process.env.SUPABASE_DB_CA && !existsSync(CERTIFICADO)) {
    console.error("SUPABASE_DB_CA aponta para um arquivo que não existe.");
    process.exit(1);
  }
  const url = new URL(env.SUPABASE_DB_URL);
  url.searchParams.delete("sslmode");
  // Com o certificado da Supabase salvo em supabase/prod-ca.crt, a conexão
  // confere que o servidor é mesmo a Supabase. Sem ele, continua
  // criptografada, mas sem essa conferência.
  const ssl = existsSync(CERTIFICADO)
    ? { ca: readFileSync(CERTIFICADO, "utf8"), rejectUnauthorized: true }
    : { rejectUnauthorized: false };
  const db = new pg.Client({ connectionString: url.toString(), ssl, application_name: "testes-transacao-desfeita" });
  try {
    await db.connect();
  } catch (erro) {
    console.error("Não conectou ao banco:", limpar(erro.message));
    process.exit(1);
  }
  console.log(
    existsSync(CERTIFICADO)
      ? `(conexão: TLS conferindo o certificado do servidor com ${path.relative(raiz, CERTIFICADO).split(path.sep).join("/")})`
      : "(conexão: TLS sem conferir o certificado — supabase/prod-ca.crt ausente)"
  );
  return db;
}

const resultados = [];

export function registrar(nome, ok, detalhe) {
  resultados.push({ nome, ok });
  console.log(`\n[${ok ? "PASS" : "FAIL"}] ${nome}`);
  if (detalhe) console.log(`       ${limpar(detalhe)}`);
}

// Roda `corpo(db)` numa transação que é SEMPRE desfeita.
export async function emTransacaoDesfeita(titulo, corpo) {
  const db = await conectar();
  console.log(`${titulo}\n(tudo roda numa transação desfeita no fim — nada é gravado)`);
  console.log("=".repeat(70));
  try {
    await db.query("begin");
    await db.query("set local lock_timeout = '2s'");
    await db.query("set local statement_timeout = '5s'");
    if (comMigracao) {
      const sql = readFileSync(MIGRACAO, "utf8");
      if (/^\s*(begin|commit|end)\s*;/im.test(sql)) throw new Error("A migração não pode ter begin/commit próprios.");
      await db.query(sql);
      console.log(`Migração ${path.relative(raiz, MIGRACAO).split(path.sep).join("/")} aplicada DENTRO da transação desfeita.`);
    }
    await corpo(db);
  } catch (erro) {
    registrar("Execução sem erro inesperado", false, erro.message);
  } finally {
    await db.query("rollback").catch(() => {});
    await db.end();
  }
  resumir("Transação desfeita.");
}

export function resumir(final = "") {
  const falhas = resultados.filter((r) => !r.ok);
  console.log("\n" + "=".repeat(70));
  console.log(`Resumo: ${resultados.length - falhas.length}/${resultados.length} verificações passaram. ${final}`.trim());
  if (falhas.length) {
    console.log("Falharam:\n  - " + falhas.map((f) => f.nome).join("\n  - "));
    process.exitCode = 1;
  }
}

// Um cenário isolado: tudo que ele fizer (inclusive trocar de papel) é
// desfeito ao final, antes do próximo cenário.
//   como(papel)  -> passa a agir como anon | authenticated | service_role
//   dono()       -> volta ao papel da conexão (postgres), para conferir
//   q(sql, args) -> consulta; erro sobe
//   tentar(sql, args) -> { ok, rows, rowCount } ou { ok: false, code, message }
export async function cenario(db, corpo) {
  await db.query("savepoint cenario");
  const ctx = {
    async como(papel) {
      const claims = papel === "authenticated" ? { role: papel, sub: SUB_LOGADO } : { role: papel };
      await db.query(`set local role ${papel}`);
      await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    },
    async dono() {
      await db.query("reset role");
      await db.query("select set_config('request.jwt.claims', '', true)");
    },
    q: (sql, args) => db.query(sql, args),
    async tentar(sql, args) {
      await db.query("savepoint tentativa");
      try {
        const r = await db.query(sql, args);
        await db.query("release savepoint tentativa");
        return { ok: true, rows: r.rows, rowCount: r.rowCount };
      } catch (erro) {
        await db.query("rollback to savepoint tentativa");
        return { ok: false, code: erro.code, message: erro.message };
      }
    },
  };
  try {
    return await corpo(ctx);
  } finally {
    await db.query("rollback to savepoint cenario");
    await db.query("release savepoint cenario");
  }
}

// Formata o resultado de tentar() para o log.
export function descrever(r) {
  if (r.ok) return `aceito (${r.rowCount} linha(s))`;
  return `recusado: ${r.code} ${r.message}`;
}

export const SEM_PERMISSAO = "42501";
