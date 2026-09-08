// Teste automatizado de RLS (Row Level Security) para a tabela "produtos".
// Usa o client anônimo (SUPABASE_ANON_KEY), sem autenticação, e verifica que:
//   1. SELECT é permitido (leitura pública)
//   2. INSERT é bloqueado
//   3. DELETE é bloqueado
//
// Uso: node scripts/test-rls.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function loadEnvLocal() {
  const envPath = path.join(rootDir, ".env.local");
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Faltam SUPABASE_URL / SUPABASE_ANON_KEY em .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const results = [];

function report(name, passed, detail) {
  results.push({ name, passed });
  console.log(`\n[${passed ? "PASS" : "FAIL"}] ${name}`);
  if (detail) console.log(detail);
}

async function testSelect() {
  const { data, error } = await supabase.from("produtos").select("*").limit(10);

  const passed = error === null && Array.isArray(data);
  report(
    "1. SELECT anônimo em 'produtos' deve funcionar",
    passed,
    error
      ? `Erro inesperado: ${JSON.stringify(error)}`
      : `OK — ${data.length} linha(s) retornada(s).`
  );

  return data ?? [];
}

async function testInsert() {
  const probeName = `RLS_TEST_INSERT_${Date.now()}`;

  const { data, error } = await supabase
    .from("produtos")
    .insert({
      nome: probeName,
      preco: 1,
      descricao: "linha de teste criada pelo script test-rls.mjs",
      pedido_minimo: 1,
    })
    .select();

  if (error) {
    report(
      "2. INSERT anônimo em 'produtos' deve ser bloqueado",
      true,
      `OK — insert rejeitado. code=${error.code} message="${error.message}"`
    );
    return;
  }

  // Sem erro: verifica se a linha realmente foi criada (RLS pode retornar
  // sucesso "vazio" em vez de erro, dependendo da política).
  const { data: check } = await supabase
    .from("produtos")
    .select("*")
    .eq("nome", probeName);

  const leaked = (check?.length ?? 0) > 0;
  report(
    "2. INSERT anônimo em 'produtos' deve ser bloqueado",
    !leaked,
    leaked
      ? `FALHA — o insert foi aceito e a linha "${probeName}" foi criada. ` +
        `RLS permite INSERT anônimo. Remova manualmente essa linha (chave de service role necessária, pois delete anônimo também deveria estar bloqueado).`
      : `OK — nenhum erro retornado, mas nenhuma linha foi persistida (insert vazio).`
  );
}

async function testDelete(existingRows) {
  if (existingRows.length === 0) {
    report(
      "3. DELETE anônimo em 'produtos' deve ser bloqueado",
      false,
      "Não há nenhuma linha existente para tentar apagar (tabela vazia) — teste inconclusivo."
    );
    return;
  }

  const target = existingRows[0];

  const { data, error } = await supabase
    .from("produtos")
    .delete()
    .eq("nome", target.nome)
    .select();

  if (error) {
    report(
      "3. DELETE anônimo em 'produtos' deve ser bloqueado",
      true,
      `OK — delete rejeitado. code=${error.code} message="${error.message}"`
    );
    return;
  }

  // Sem erro: confirma se a linha ainda existe (RLS pode "deletar 0 linhas"
  // silenciosamente em vez de retornar erro).
  const { data: stillThere } = await supabase
    .from("produtos")
    .select("*")
    .eq("nome", target.nome);

  const wasDeleted = (stillThere?.length ?? 0) === 0;
  report(
    "3. DELETE anônimo em 'produtos' deve ser bloqueado",
    !wasDeleted,
    wasDeleted
      ? `FALHA — a linha "${target.nome}" foi apagada por um cliente anônimo. RLS permite DELETE anônimo.`
      : `OK — nenhum erro retornado, mas nenhuma linha foi afetada (delete vazio); a linha "${target.nome}" continua na tabela.`
  );
}

async function main() {
  console.log(`Testando RLS de 'produtos' em ${supabaseUrl} (sem autenticação)\n`);
  console.log("=".repeat(70));

  const rows = await testSelect();
  await testInsert();
  await testDelete(rows);

  console.log("\n" + "=".repeat(70));
  const failed = results.filter((r) => !r.passed);
  console.log(
    `\nResumo: ${results.length - failed.length}/${results.length} testes passaram.`
  );

  if (failed.length > 0) {
    console.log("Falharam:", failed.map((f) => f.name).join(", "));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Erro inesperado ao rodar os testes:", err);
  process.exit(1);
});
