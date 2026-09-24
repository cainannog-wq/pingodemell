// Teste de RLS da tabela "produto_fotos" (galeria de fotos extras), SÓ DE
// LEITURA, contra o banco de produção (SUPABASE_URL do .env.local).
//
// Usa os dois produtos fixos de teste (dados fictícios):
//   - Morango Banhado (fixo de ativo)
//   - Torta de Limão (fatia) (fixo de inativo)
// Prova:
//   0. pré-condição (service role, só leitura): o fixo de ativo está ativo
//      e o de inativo está inativo, e os dois têm foto extra;
//   1. fixo de ativo: anônimo lê mais que zero fotos;
//   2. fixo de ativo: logado lê o mesmo número que o anônimo;
//   3. fixo de inativo: logado lê mais que zero;
//   4. fixo de inativo: anônimo lê zero filtrando direto pelo id do produto;
//   5. fixo de inativo: anônimo lendo a tabela inteira não recebe nenhuma
//      foto dele.
// Não depende do número exato de fotos, para continuar válido depois das
// provas de adicionar/remover/reordenar. Não cria, altera nem apaga nada
// no banco nem no storage. A sessão logada vem de link mágico da Admin API
// (mesmo mecanismo de scripts/test-rls.mjs) e é encerrada no fim.
//
// Uso: node scripts/test-rls-fotos.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const FIXO_ATIVO = { id: "8b4f3b06-7e38-4d9e-ad8e-3a6a4935e1a1", nome: "Morango Banhado" };
const FIXO_INATIVO = { id: "5a02782b-f4a1-4b49-90a5-38cf0f43f879", nome: "Torta de Limão (fatia)" };

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function loadEnvLocal() {
  const content = readFileSync(path.join(rootDir, ".env.local"), "utf-8");
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

const { SUPABASE_URL: url, SUPABASE_ANON_KEY: anonKey, SUPABASE_SERVICE_ROLE_KEY: serviceKey, TEST_ADMIN_EMAIL: email } =
  process.env;
if (!url || !anonKey || !serviceKey || !email) {
  console.error("Faltam SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY / TEST_ADMIN_EMAIL em .env.local");
  process.exit(1);
}

const semSessao = { auth: { autoRefreshToken: false, persistSession: false } };
const anon = createClient(url, anonKey, semSessao);
const admin = createClient(url, serviceKey, semSessao);

const results = [];
function report(name, passed, detail) {
  results.push({ name, passed });
  console.log(`\n[${passed ? "PASS" : "FAIL"}] ${name}`);
  if (detail) console.log(detail);
}

async function contar(cliente, produtoId) {
  const { data, error } = await cliente.from("produto_fotos").select("id").eq("produto_id", produtoId);
  return { n: data?.length ?? 0, error };
}

async function sessaoLogada() {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data?.properties?.hashed_token) throw new Error(`não gerou o link mágico: ${error?.message}`);
  const cliente = createClient(url, anonKey, semSessao);
  const { error: erroOtp } = await cliente.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: "magiclink" });
  if (erroOtp) throw new Error(`não trocou o link por sessão: ${erroOtp.message}`);
  return cliente;
}

async function main() {
  console.log(`Testando RLS de 'produto_fotos' em ${url} (só leitura)`);
  console.log("=".repeat(70));

  // 0. Pré-condição, pela service role (ignora RLS; só leitura).
  const { data: fixos } = await admin.from("produtos").select("id, nome, ativo").in("id", [FIXO_ATIVO.id, FIXO_INATIVO.id]);
  const ativo = fixos?.find((p) => p.id === FIXO_ATIVO.id);
  const inativo = fixos?.find((p) => p.id === FIXO_INATIVO.id);
  const refAtivo = await contar(admin, FIXO_ATIVO.id);
  const refInativo = await contar(admin, FIXO_INATIVO.id);
  const preOk = ativo?.ativo === true && inativo?.ativo === false && refAtivo.n > 0 && refInativo.n > 0;
  report(
    "0. Pré-condição: fixo de ativo ativo, fixo de inativo inativo, ambos com foto extra",
    preOk,
    `${FIXO_ATIVO.nome}: ativo=${ativo?.ativo}, ${refAtivo.n} foto(s) no banco. ${FIXO_INATIVO.nome}: ativo=${inativo?.ativo}, ${refInativo.n} foto(s) no banco.`
  );

  const logado = await sessaoLogada();
  try {
    const anonAtivo = await contar(anon, FIXO_ATIVO.id);
    report(
      `1. Anônimo lê fotos do fixo de ativo (${FIXO_ATIVO.nome}): mais que zero`,
      !anonAtivo.error && anonAtivo.n > 0,
      anonAtivo.error ? `Erro: ${anonAtivo.error.message}` : `Anônimo leu ${anonAtivo.n}.`
    );

    const logadoAtivo = await contar(logado, FIXO_ATIVO.id);
    report(
      "2. Logado lê o mesmo número de fotos do fixo de ativo que o anônimo",
      !logadoAtivo.error && logadoAtivo.n === anonAtivo.n && logadoAtivo.n > 0,
      `Logado leu ${logadoAtivo.n}, anônimo leu ${anonAtivo.n}.`
    );

    const logadoInativo = await contar(logado, FIXO_INATIVO.id);
    report(
      `3. Logado lê fotos do fixo de inativo (${FIXO_INATIVO.nome}): mais que zero`,
      !logadoInativo.error && logadoInativo.n > 0,
      `Logado leu ${logadoInativo.n}.`
    );

    const anonInativo = await contar(anon, FIXO_INATIVO.id);
    report(
      "4. Anônimo lê zero fotos do fixo de inativo, filtrando direto pelo id do produto",
      !anonInativo.error && anonInativo.n === 0,
      anonInativo.error ? `Erro: ${anonInativo.error.message}` : `Anônimo leu ${anonInativo.n}.`
    );

    const { data: tudo, error: erroTudo } = await anon.from("produto_fotos").select("produto_id");
    const vazadas = (tudo ?? []).filter((linha) => linha.produto_id === FIXO_INATIVO.id).length;
    report(
      "5. Anônimo lendo a tabela inteira não recebe nenhuma foto do fixo de inativo",
      !erroTudo && vazadas === 0,
      `Anônimo leu ${tudo?.length ?? 0} linha(s) no total, ${vazadas} do fixo de inativo.`
    );
  } finally {
    await logado.auth.signOut();
  }

  console.log("\n" + "=".repeat(70));
  const falhas = results.filter((r) => !r.passed);
  console.log(`\nResumo: ${results.length - falhas.length}/${results.length} testes passaram.`);
  if (falhas.length > 0) {
    console.log("Falharam:", falhas.map((f) => f.name).join(", "));
    process.exit(1);
  }
}

main().catch((erro) => {
  console.error("Erro inesperado ao rodar os testes:", erro);
  process.exit(1);
});
