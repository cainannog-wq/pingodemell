#!/usr/bin/env node
// Teste B6 (rate limit) e B23 (preview do Netlify) — agora que o Netlify
// está conectado, roda contra o deploy REAL (branch painel-de-pedidos),
// não só localhost. Duas coisas provadas de uma vez:
//
//   1. Rate limit por IP continua bloqueando na 6ª requisição no Netlify
//      real (com o proxy de verdade na frente, não o fallback local).
//   2. Tentar forjar X-Forwarded-For com um IP diferente a cada
//      requisição NÃO reseta o contador — confirma que o código
//      realmente ignora esse header em produção (x-nf-client-connection-ip
//      é quem manda).
//   3. Efeito colateral útil: como os pedidos de teste aparecem no MESMO
//      Supabase que os scripts locais usam (SUPABASE_URL de .env.local),
//      confirma que o preview do Netlify aponta pro banco de produção,
//      não pra um banco separado (achado B23).
//
// Uso: node scripts/test-rate-limit-netlify.mjs --base-url https://painel-de-pedidos--pingodemell.netlify.app

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
  const args = { baseUrl: "https://painel-de-pedidos--pingodemell.netlify.app", maxRequests: 12 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--base-url") args.baseUrl = argv[++i];
    else if (argv[i] === "--max-requests") args.maxRequests = Number(argv[++i]);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const MARCA = `AUDIT_TEST_NETLIFY_RATELIMIT_${Date.now()}`;

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

// Um IP forjado diferente por tentativa, tentando burlar o rate limit.
function ipForjado(n) {
  return `203.0.113.${n}`;
}

async function enviarPedido(n) {
  const res = await fetch(`${args.baseUrl}/api/pedidos`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": ipForjado(n),
    },
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

async function main() {
  console.log("=== Teste — rate limit + spoofing de IP contra o Netlify real ===");
  console.log(`Endpoint alvo: ${args.baseUrl}/api/pedidos`);
  console.log(`Cada requisição manda um X-Forwarded-For diferente (203.0.113.N) tentando resetar o limite.\n`);

  const results = [];
  let firstBlockedAt = null;

  for (let i = 1; i <= args.maxRequests; i++) {
    const r = await enviarPedido(i);
    results.push(r);
    const tag = r.status === 429 ? "BLOQUEADO (429)" : `passou (${r.status})`;
    console.log(`Requisição ${String(i).padStart(2, " ")} | X-Forwarded-For=${ipForjado(i)} | status ${r.status} | ${tag}${r.body?.error ? ` — ${r.body.error}` : ""}`);

    if (r.status === 429 && firstBlockedAt === null) {
      firstBlockedAt = i;
      break;
    }
  }

  const passedCount = firstBlockedAt !== null ? firstBlockedAt - 1 : results.filter((r) => r.status < 400).length;

  console.log("\n=== RESULTADO — rate limit ===");
  console.log(`Requisições que passaram antes do 429: ${passedCount}`);
  console.log(`Recebeu 429 em algum momento?          ${firstBlockedAt !== null ? "SIM" : "NÃO"}`);
  console.log(
    firstBlockedAt !== null
      ? "OK: o X-Forwarded-For forjado (diferente a cada tentativa) NÃO resetou o contador — o limite é por IP real do Netlify, não pelo header."
      : "FALHA: nenhuma resposta 429 apareceu — ou o rate limit não está ativo em produção, ou o spoofing de X-Forwarded-For está funcionando."
  );

  // B23: confirma que os pedidos de teste caíram no MESMO Supabase que
  // .env.local aponta (preview/produção compartilham banco).
  const SUPABASE_URL = getEnv("SUPABASE_URL");
  const SERVICE_ROLE_KEY = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  console.log("\n=== RESULTADO — B23 (preview aponta pro banco de produção?) ===");
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.log("Não foi possível verificar — SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes em .env.local.");
  } else {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, count } = await admin.from("pedidos").select("numero", { count: "exact" }).like("cliente_nome", `${MARCA}%`);
    if ((count ?? 0) > 0) {
      console.log(`OK — ${count} pedido(s) de teste criado(s) via ${args.baseUrl} apareceram em ${SUPABASE_URL} (mesmo projeto usado pelos scripts locais e pela produção). Confirma: o deploy de preview usa o MESMO banco de dados real, não um banco separado de teste.`);
    } else {
      console.log(`Nenhum pedido de teste encontrado em ${SUPABASE_URL} — ou o deploy usa outro banco (bom sinal de isolamento), ou nenhuma requisição passou antes do rate limit.`);
    }
  }

  // Limpeza.
  if (SUPABASE_URL && SERVICE_ROLE_KEY) {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { error, count } = await admin.from("pedidos").delete({ count: "exact" }).like("cliente_nome", `${MARCA}%`);
    console.log(error ? `\n(Falha ao limpar pedidos de teste: ${error.message})` : `\nLimpeza: ${count ?? 0} pedido(s) de teste removido(s).`);
  }

  if (firstBlockedAt === null) process.exitCode = 2;
}

main().catch((err) => {
  console.error("Erro inesperado:", err);
  process.exit(1);
});
