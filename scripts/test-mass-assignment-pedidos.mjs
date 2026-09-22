#!/usr/bin/env node
// Teste automatizado — B12 (mass assignment) em 'pedidos', auditoria de
// segurança de 14/09/2026.
//
// Insere direto via client anônimo (anon key), batendo no PostgREST do
// Supabase igual um atacante faria — sem passar por /api/pedidos, que só
// valida quem usa a rota, não quem chama a tabela direto. Prova que:
//   1. status não pode ser setado no insert (sempre nasce
//      "aguardando_confirmacao")
//   2. id não pode ser escolhido pelo cliente
//   3. criado_em não pode ser forjado
//   4. numero continua protegido (GENERATED ALWAYS AS IDENTITY)
//   5. subtotal/total são sempre recalculados a partir de `itens`, mesmo
//      que o cliente mande valores divergentes
//
// Correção aplicada em supabase/pedidos-hardening.sql — rode esse arquivo
// no SQL Editor do Supabase antes deste teste passar.
//
// Uso: node scripts/test-mass-assignment-pedidos.mjs

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

function loadDotEnv(filePath) {
  if (!existsSync(filePath)) return {};
  const out = {};
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

const dotenv = loadDotEnv(path.join(projectRoot, ".env.local"));
function getEnv(name) {
  return process.env[name] || dotenv[name] || "";
}

const supabaseUrl = getEnv("SUPABASE_URL");
const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY");
const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
  console.error("Faltam SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY em .env.local");
  process.exit(1);
}

const anon = createClient(supabaseUrl, supabaseAnonKey, { auth: { autoRefreshToken: false, persistSession: false } });
const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

const MARCA = `AUDIT_TEST_MASSASSIGN_${Date.now()}`;
const results = [];
function report(name, passed, detail) {
  results.push({ name, passed });
  console.log(`\n[${passed ? "PASS" : "FAIL"}] ${name}`);
  if (detail) console.log(detail);
}

function baseValido(overrides = {}) {
  return {
    cliente_nome: MARCA,
    cliente_whatsapp: "(41) 90000-0000",
    modo_entrega: "retirada",
    data_hora_entrega: new Date(Date.now() + 86400000).toISOString(),
    forma_pagamento: "PIX",
    itens: [{ nome: "Item de teste", quantidade: 1, preco_unitario: 1 }],
    subtotal: 1,
    total: 1,
    ...overrides,
  };
}

async function main() {
  console.log(`Testando mass assignment em 'pedidos' via anon key direto (bypass de /api/pedidos) em ${supabaseUrl}\n`);
  console.log("=".repeat(70));

  // 1. status não pode ser setado pelo cliente.
  {
    const marca = `${MARCA}_status`;
    const { error } = await anon.from("pedidos").insert(baseValido({ cliente_nome: marca, status: "entregue" }));
    const { data: row } = await admin.from("pedidos").select("status").eq("cliente_nome", marca).maybeSingle();
    const seguro = row === null || row.status === "aguardando_confirmacao";
    report(
      "1. INSERT anônimo não consegue setar status != 'aguardando_confirmacao'",
      seguro,
      error
        ? `Insert rejeitado, como esperado: ${error.message}`
        : `status gravado: "${row?.status}"`
    );
  }

  // 2. id não pode ser escolhido pelo cliente.
  {
    const marca = `${MARCA}_id`;
    const idForjado = "00000000-0000-4000-8000-000000000001";
    const { error } = await anon.from("pedidos").insert(baseValido({ cliente_nome: marca, id: idForjado }));
    const { data: row } = await admin.from("pedidos").select("id").eq("cliente_nome", marca).maybeSingle();
    const seguro = row === null || row.id !== idForjado;
    report(
      "2. INSERT anônimo não consegue escolher o próprio id (uuid)",
      seguro,
      error ? `Insert rejeitado, como esperado: ${error.message}` : `id gravado: "${row?.id}"`
    );
  }

  // 3. criado_em não pode ser forjado.
  {
    const marca = `${MARCA}_criado_em`;
    const dataForjada = "2020-01-01T00:00:00.000Z";
    const { error } = await anon.from("pedidos").insert(baseValido({ cliente_nome: marca, criado_em: dataForjada }));
    const { data: row } = await admin.from("pedidos").select("criado_em").eq("cliente_nome", marca).maybeSingle();
    const seguro = row === null || !row.criado_em.startsWith("2020-01-01");
    report(
      "3. INSERT anônimo não consegue forjar criado_em",
      seguro,
      error ? `Insert rejeitado, como esperado: ${error.message}` : `criado_em gravado: "${row?.criado_em}"`
    );
  }

  // 4. numero continua protegido (GENERATED ALWAYS AS IDENTITY).
  {
    const marca = `${MARCA}_numero`;
    const { error } = await anon.from("pedidos").insert(baseValido({ cliente_nome: marca, numero: 999999 }));
    const { data: row } = await admin.from("pedidos").select("numero").eq("cliente_nome", marca).maybeSingle();
    const seguro = row === null || row.numero !== 999999;
    report(
      "4. INSERT anônimo não consegue escolher o próprio 'numero'",
      seguro,
      error ? `Insert rejeitado, como esperado: ${error.message}` : `numero gravado: "${row?.numero}"`
    );
  }

  // 5. subtotal/total sempre recalculados a partir de itens.
  {
    const marca = `${MARCA}_total`;
    const { error } = await anon.from("pedidos").insert(
      baseValido({
        cliente_nome: marca,
        itens: [{ nome: "Bolo caro", quantidade: 1, preco_unitario: 500 }],
        subtotal: 0.01,
        total: 0.01,
      })
    );
    const { data: row } = await admin.from("pedidos").select("subtotal,total").eq("cliente_nome", marca).maybeSingle();
    const seguro = row !== null && row.total === 500 && row.subtotal === 500;
    report(
      "5. subtotal/total gravados batem com os itens, não com o que o cliente mandou",
      seguro,
      error
        ? `Insert retornou erro (não deveria — o insert em si é válido, só os totais deveriam ser recalculados): ${error.message}`
        : `subtotal/total gravados: ${row?.subtotal} / ${row?.total} (esperado: 500 / 500)`
    );
  }

  console.log("\n" + "=".repeat(70));
  const failed = results.filter((r) => !r.passed);
  console.log(`\nResumo: ${results.length - failed.length}/${results.length} testes passaram.`);
  if (failed.length > 0) {
    console.log("Falharam:", failed.map((f) => f.name).join(" | "));
    console.log("\nSe isso falhou, rode supabase/pedidos-hardening.sql no SQL Editor do Supabase e tente de novo.");
  }

  const { error: cleanupError, count } = await admin
    .from("pedidos")
    .delete({ count: "exact" })
    .like("cliente_nome", `${MARCA}%`);
  console.log(cleanupError ? `\nFalha na limpeza: ${cleanupError.message}` : `\nLimpeza: ${count ?? 0} registro(s) de teste removido(s).`);

  if (failed.length > 0) process.exit(1);
}

main().catch(async (err) => {
  console.error("Erro inesperado:", err);
  await admin.from("pedidos").delete().like("cliente_nome", `${MARCA}%`);
  process.exit(1);
});
