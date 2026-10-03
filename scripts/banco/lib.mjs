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
// --com-migracao=<arquivo.sql>[,<outro.sql>...]: roda esses arquivos, na
// ordem, dentro da mesma transação desfeita, antes das verificações. Serve
// para provar uma migração antes de aplicá-la (ex.:
// --com-migracao=supabase/produtos-slug.sql). Depois de aplicada em
// produção, rode sem.
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

// Arquivos de --com-migracao=..., já conferidos (existem). Vazio = sem
// migração simulada.
function lerMigracoes(argv) {
  const arg = argv.find((a) => a === "--com-migracao" || a.startsWith("--com-migracao="));
  if (!arg) return [];
  const lista = arg.includes("=")
    ? arg.slice(arg.indexOf("=") + 1).split(",").map((a) => a.trim()).filter(Boolean)
    : [];
  if (lista.length === 0) {
    console.error("Use --com-migracao=<arquivo.sql> (ex.: --com-migracao=supabase/produtos-slug.sql).");
    process.exit(1);
  }
  return lista.map((a) => {
    const arquivo = path.resolve(raiz, a);
    if (!existsSync(arquivo)) {
      console.error(`Migração não encontrada: ${a}`);
      process.exit(1);
    }
    return arquivo;
  });
}

export const MIGRACOES = lerMigracoes(process.argv);
export const comMigracao = MIGRACOES.length > 0;

export function relativo(arquivo) {
  return path.relative(raiz, arquivo).split(path.sep).join("/");
}

// Roda um arquivo de migração na conexão, dentro da transação já aberta.
export async function rodarMigracao(db, arquivo) {
  const sql = readFileSync(arquivo, "utf8");
  // "end;" sozinho fica de fora: é o fim de todo corpo de função plpgsql.
  if (/^\s*(begin|start\s+transaction|commit|rollback)\s*;/im.test(sql)) {
    throw new Error(`A migração ${relativo(arquivo)} não pode ter begin/commit próprios.`);
  }
  await db.query(sql);
}

// nome: application_name da conexão. silencioso: não imprime a linha da
// conexão (scripts/exclusao/, cuja saída é lida pelo Cainan).
export async function conectar({ nome = "testes-transacao-desfeita", silencioso = false } = {}) {
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
  const db = new pg.Client({ connectionString: url.toString(), ssl, application_name: nome });
  try {
    await db.connect();
  } catch (erro) {
    console.error("Não conectou ao banco:", limpar(erro.message));
    process.exit(1);
  }
  if (!silencioso) console.log(
    existsSync(CERTIFICADO)
      ? `(conexão: TLS conferindo o certificado do servidor com ${path.relative(raiz, CERTIFICADO).split(path.sep).join("/")})`
      : "(conexão: TLS sem conferir o certificado — supabase/prod-ca.crt ausente)"
  );
  return db;
}

const resultados = [];
const pulados = [];

export function registrar(nome, ok, detalhe) {
  resultados.push({ nome, ok });
  console.log(`\n[${ok ? "PASS" : "FAIL"}] ${nome}`);
  if (detalhe) console.log(`       ${limpar(detalhe)}`);
}

// Teste que não se aplica ao estado do banco (ex.: simula o estado de
// antes de uma migração não-aditiva que já está aplicada). Não conta como
// falha e aparece no resumo. scripts/banco/rodar-todos.mjs conta as linhas
// "[----] ... pulado:".
export function pular(nome, motivo) {
  pulados.push(nome);
  console.log(`\n[----] ${nome} pulado: ${motivo}`);
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
    for (const arquivo of MIGRACOES) {
      await rodarMigracao(db, arquivo);
      console.log(`Migração ${relativo(arquivo)} aplicada DENTRO da transação desfeita.`);
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
  const textoPulados = pulados.length ? ` ${pulados.length} pulado(s).` : "";
  console.log(`Resumo: ${resultados.length - falhas.length}/${resultados.length} verificações passaram.${textoPulados} ${final}`.trim());
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
