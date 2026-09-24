// Teste automatizado de RLS (Row Level Security) para a tabela "produtos".
// Usa o client anônimo (SUPABASE_ANON_KEY), sem autenticação, e verifica que:
//   1. SELECT é permitido (leitura pública)
//   2. INSERT é bloqueado
//   3. DELETE é bloqueado
// E, a partir da migração supabase/produtos-rls-leitura-ativo.sql:
//   4. anônimo lê produto ativo, e só ativo
//   5. anônimo NÃO lê produto inativo, nem filtrando por ativo=false
//   6. anônimo NÃO lê produto inativo nem buscando direto pelo id
//   7. usuário logado (admin) lê todos, ativos e inativos
//
// Os testes 4-7 só leem: usam os produtos (fictícios) que já existem no
// banco, sem criar nem alterar nenhum. A lista de referência (quais são os
// inativos e quantos produtos existem) vem da service role, que ignora RLS.
// A sessão logada vem de magic link via Admin API, mesmo mecanismo de
// scripts/test-rls-pedidos.mjs (sem passar pelo CAPTCHA do login).
//
// Roda contra o banco de .env.local — hoje, o de produção (único banco).
// Antes da migração ser aplicada, os testes 4-6 FALHAM (é o esperado).
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

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const testAdminEmail = process.env.TEST_ADMIN_EMAIL;

if (!serviceRoleKey || !testAdminEmail) {
  console.error("Faltam SUPABASE_SERVICE_ROLE_KEY / TEST_ADMIN_EMAIL em .env.local (testes 4-7)");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

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

async function testLeituraSoAtivos() {
  // Referência: o que existe de verdade (service role ignora RLS).
  const { data: todos, error: refError } = await admin.from("produtos").select("id, nome, ativo");
  if (refError || !todos) {
    report("4-7. Leitura só de ativos", false, `Falha ao ler a referência via service role: ${refError?.message}`);
    return;
  }
  const ativos = todos.filter((p) => p.ativo);
  const inativos = todos.filter((p) => !p.ativo);
  console.log(`
Referência (service role): ${todos.length} produtos — ${ativos.length} ativos, ${inativos.length} inativos.`);
  if (inativos.length === 0) {
    report("4-7. Leitura só de ativos", false, "Nenhum produto inativo no banco — testes 5-7 inconclusivos.");
    return;
  }

  // 4. Anônimo lê ativo, e só ativo.
  {
    const { data, error } = await supabase.from("produtos").select("id, ativo");
    const lidos = data ?? [];
    const passed = error === null && lidos.length === ativos.length && lidos.every((p) => p.ativo === true);
    report(
      "4. SELECT anônimo lê todos os ativos e só ativos",
      passed,
      error
        ? `Erro inesperado: ${JSON.stringify(error)}`
        : `Anônimo leu ${lidos.length} produto(s) (esperado ${ativos.length}); inativos entre eles: ${lidos.filter((p) => !p.ativo).length} (esperado 0).`
    );
  }

  // 5. Anônimo filtrando por inativo não recebe nada.
  {
    const { data, error } = await supabase.from("produtos").select("id").eq("ativo", false);
    const passed = error === null && (data?.length ?? 0) === 0;
    report(
      "5. SELECT anônimo com ativo=false não devolve nada",
      passed,
      error ? `Erro inesperado: ${JSON.stringify(error)}` : `Anônimo leu ${data.length} inativo(s) (esperado 0).`
    );
  }

  // 6. Anônimo buscando cada inativo direto pelo id não recebe nada.
  {
    const vazados = [];
    for (const p of inativos) {
      const { data, error } = await supabase.from("produtos").select("id, nome").eq("id", p.id);
      if (error || (data?.length ?? 0) > 0) vazados.push(p.nome);
    }
    report(
      "6. SELECT anônimo pelo id de um inativo volta vazio",
      vazados.length === 0,
      vazados.length === 0
        ? `OK — ${inativos.length} inativo(s) buscado(s) pelo id, todos vazios: ${inativos.map((p) => p.nome).join(", ")}.`
        : `FALHA — anônimo leu pelo id: ${vazados.join(", ")}.`
    );
  }

  // 7. Logado lê todos, ativos e inativos.
  {
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: testAdminEmail,
    });
    if (linkError || !linkData?.properties?.hashed_token) {
      report("7. SELECT logado lê ativos e inativos", false, `Não foi possível gerar sessão de teste: ${linkError?.message}`);
      return;
    }
    const authed = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: verifyError } = await authed.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: "magiclink",
    });
    if (verifyError) {
      report("7. SELECT logado lê ativos e inativos", false, `Falha ao trocar o magic link por sessão: ${verifyError.message}`);
      return;
    }
    const { data, error } = await authed.from("produtos").select("id, ativo");
    const lidos = data ?? [];
    const passed = error === null && lidos.length === todos.length && lidos.filter((p) => !p.ativo).length === inativos.length;
    report(
      "7. SELECT logado lê ativos e inativos",
      passed,
      error
        ? `Erro inesperado: ${JSON.stringify(error)}`
        : `Logado leu ${lidos.length} produto(s) (esperado ${todos.length}), ${lidos.filter((p) => !p.ativo).length} inativo(s) (esperado ${inativos.length}).`
    );
  }
}

async function main() {
  console.log(`Testando RLS de 'produtos' em ${supabaseUrl} (anônimo e logado)\n`);
  console.log("=".repeat(70));

  const rows = await testSelect();
  await testInsert();
  await testDelete(rows);
  await testLeituraSoAtivos();

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
