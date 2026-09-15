#!/usr/bin/env node
/**
 * Teste automatizado do rate limit de POST /api/pedidos (proteção contra
 * flood no insert público de pedidos — ver supabase/pedidos-schema.sql).
 *
 * Bate repetidamente o endpoint com um pedido válido, do mesmo IP, e
 * confere que a 6ª requisição em diante (limite configurado: 5 a cada 10
 * minutos) volta 429. Cada requisição que passa cria um pedido de
 * verdade na tabela — este script apaga os que criou ao final, via
 * service role key.
 *
 * USO:
 *   node scripts/test-rate-limit-pedidos.mjs --base-url http://localhost:3000
 *   node scripts/test-rate-limit-pedidos.mjs --base-url https://SEU-STAGING.netlify.app
 *
 * Variáveis necessárias (lidas de .env.local se não exportadas):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (só para limpar os pedidos de teste)
 */

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

function parseArgs(argv) {
  const args = { baseUrl: "http://localhost:3000", maxRequests: 12 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--base-url") args.baseUrl = argv[++i];
    else if (argv[i] === "--max-requests") args.maxRequests = Number(argv[++i]);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const MARCA = `RATE_LIMIT_TEST_${Date.now()}`;

function pedidoValido(n) {
  return {
    cliente_nome: `${MARCA}_${n}`,
    cliente_whatsapp: "(41) 90000-0000",
    modo_entrega: "retirada",
    data_hora_entrega: new Date(Date.now() + 86400000).toISOString(),
    forma_pagamento: "PIX",
    itens: [{ nome: "Item de teste", quantidade: 1, preco_unitario: 1 }],
  };
}

async function enviarPedido(n) {
  const res = await fetch(`${args.baseUrl}/api/pedidos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(pedidoValido(n)),
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    // ignore
  }
  return { n, status: res.status, body };
}

async function limparPedidosDeTeste() {
  const SUPABASE_URL = getEnv("SUPABASE_URL");
  const SERVICE_ROLE_KEY = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.log("\n(SUPABASE_SERVICE_ROLE_KEY ausente — não foi possível limpar os pedidos de teste automaticamente.)");
    return;
  }
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error, count } = await admin
    .from("pedidos")
    .delete({ count: "exact" })
    .like("cliente_nome", `${MARCA}%`);
  if (error) {
    console.log(`\n(Falha ao limpar pedidos de teste: ${error.message})`);
  } else {
    console.log(`\nLimpeza: ${count ?? 0} pedido(s) de teste removido(s).`);
  }
}

async function main() {
  console.log("=== Teste — rate limit de POST /api/pedidos ===");
  console.log(`Endpoint alvo: ${args.baseUrl}/api/pedidos`);
  console.log(`Limite esperado: 5 pedidos / 10 min por IP (ver JANELA_SEGUNDOS/LIMITE_POR_JANELA em src/app/api/pedidos/route.ts)\n`);

  const results = [];
  let firstBlockedAt = null;

  for (let i = 1; i <= args.maxRequests; i++) {
    const r = await enviarPedido(i);
    results.push(r);
    const tag = r.status === 429 ? "BLOQUEADO (429)" : `passou (${r.status})`;
    console.log(`Requisição ${String(i).padStart(2, " ")} | status ${r.status} | ${tag}${r.body?.error ? ` — ${r.body.error}` : ""}`);

    if (r.status === 429 && firstBlockedAt === null) {
      firstBlockedAt = i;
      break;
    }
  }

  const passedCount = firstBlockedAt !== null ? firstBlockedAt - 1 : results.filter((r) => r.status < 400).length;

  console.log("\n=== RESULTADO ===");
  console.log(`Requisições que passaram antes do 429: ${passedCount}`);
  console.log(`Recebeu 429 em algum momento?          ${firstBlockedAt !== null ? "SIM" : "NÃO"}`);

  await limparPedidosDeTeste();

  if (firstBlockedAt === null) {
    console.log(
      `\nFALHA: nenhuma resposta 429 apareceu em ${results.length} tentativas seguidas do mesmo IP. O rate limit não está bloqueando.`
    );
    process.exitCode = 2;
  } else {
    console.log(`\nOK: bloqueado (429) após ${passedCount} pedido(s) aceito(s), como esperado.`);
  }
}

main().catch(async (err) => {
  console.error("Erro inesperado:", err);
  await limparPedidosDeTeste();
  process.exit(1);
});
