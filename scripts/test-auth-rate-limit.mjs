#!/usr/bin/env node
/**
 * Teste automatizado do rate limit de sign-in do Supabase Auth.
 *
 * Bate repetidamente o endpoint /auth/v1/token?grant_type=password com a
 * MESMA senha errada, do mesmo IP (esta máquina), contra um e-mail alvo,
 * e conta quantas requisições passam (não-429) antes do primeiro 429
 * (Too Many Requests).
 *
 * USO (PowerShell ou bash):
 *   node scripts/test-auth-rate-limit.mjs --email admin@exemplo.com --configured "30 requests / 5 min"
 *
 * Variáveis de ambiente necessárias (lidas de .env.local se não exportadas):
 *   SUPABASE_URL
 *   SUPABASE_ANON_KEY
 *
 * ATENÇÃO: só rode isto contra um projeto Supabase de desenvolvimento/staging,
 * nunca contra produção com usuários reais.
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

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
  const args = { maxRequests: 500, delayMs: 0, configured: "não informado" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--email") args.email = argv[++i];
    else if (a === "--max-requests") args.maxRequests = Number(argv[++i]);
    else if (a === "--delay-ms") args.delayMs = Number(argv[++i]);
    else if (a === "--configured") args.configured = argv[++i];
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

const SUPABASE_URL = getEnv("SUPABASE_URL");
const SUPABASE_ANON_KEY = getEnv("SUPABASE_ANON_KEY");

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("ERRO: SUPABASE_URL e/ou SUPABASE_ANON_KEY não encontrados (env ou .env.local).");
  process.exit(1);
}

if (!args.email) {
  console.error("ERRO: informe o e-mail alvo com --email admin@exemplo.com");
  process.exit(1);
}

// Guarda simples contra rodar sem querer contra um domínio de produção óbvio.
// (checagem best-effort, não substitui confirmação humana)
if (/prod/i.test(SUPABASE_URL)) {
  console.error(`ERRO: SUPABASE_URL (${SUPABASE_URL}) parece apontar para produção. Abortando por segurança.`);
  process.exit(1);
}

const tokenEndpoint = `${SUPABASE_URL.replace(/\/$/, "")}/auth/v1/token?grant_type=password`;
const WRONG_PASSWORD = "senha-errada-de-teste-" + Math.random().toString(36).slice(2);

console.log("=== Teste de Rate Limit — Supabase Auth (sign-in) ===");
console.log(`Endpoint alvo   : ${tokenEndpoint}`);
console.log(`E-mail alvo     : ${args.email}`);
console.log(`Senha usada     : (senha errada aleatória, gerada só para este teste)`);
console.log(`Valor configurado no painel (informado pelo usuário): ${args.configured}`);
console.log(`Limite de tentativas do script: ${args.maxRequests}`);
console.log("");

async function attemptLogin(n) {
  const startedAt = Date.now();
  const res = await fetch(tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      email: args.email,
      password: WRONG_PASSWORD,
      gotrue_meta_security: { captcha_token: "XXXX.DUMMY.TOKEN.XXXX" },
    }),
  });
  const elapsedMs = Date.now() - startedAt;
  let bodyText = "";
  try {
    bodyText = await res.text();
  } catch {
    // ignore
  }
  let errorCode = "";
  try {
    errorCode = JSON.parse(bodyText).error_code || "";
  } catch {
    // ignore
  }
  return { n, status: res.status, elapsedMs, bodyText, errorCode };
}

async function main() {
  const results = [];
  const testStart = Date.now();
  let firstBlockedAt = null;

  for (let i = 1; i <= args.maxRequests; i++) {
    let attempt;
    try {
      attempt = await attemptLogin(i);
    } catch (err) {
      console.error(`Requisição ${i}: erro de rede — ${err.message}`);
      break;
    }
    results.push(attempt);

    const tag = attempt.status === 429 ? "BLOQUEADO (429)" : `passou (${attempt.status})`;
    if (i <= 10 || i % 10 === 0 || attempt.status === 429) {
      console.log(
        `Requisição ${String(i).padStart(4, " ")} | status ${attempt.status} | error_code=${attempt.errorCode || "(nenhum)"} | ${attempt.elapsedMs}ms | ${tag}`
      );
    }

    if (attempt.status === 429 && firstBlockedAt === null) {
      firstBlockedAt = i;
      // confirma que o bloqueio se mantém nas próximas tentativas (não é um 429 isolado/transiente)
      console.log("\n-> Primeiro 429 detectado. Confirmando que o bloqueio persiste (mais 5 tentativas)...");
      for (let j = 0; j < 5; j++) {
        const confirm = await attemptLogin(i + j + 1);
        results.push(confirm);
        console.log(`   Confirmação ${j + 1}: status ${confirm.status}`);
      }
      break;
    }

    if (args.delayMs > 0) {
      await new Promise((r) => setTimeout(r, args.delayMs));
    }
  }

  const totalElapsedSec = ((Date.now() - testStart) / 1000).toFixed(1);
  const passedCount = firstBlockedAt !== null ? firstBlockedAt - 1 : results.filter((r) => r.status !== 429).length;
  const gotBlocked = firstBlockedAt !== null;

  const errorCodeCounts = {};
  for (const r of results) {
    const key = r.status === 429 ? "429 (rate_limit)" : r.errorCode || `(sem error_code, status ${r.status})`;
    errorCodeCounts[key] = (errorCodeCounts[key] || 0) + 1;
  }

  console.log("\n=== RESULTADO ===");
  console.log(`Tempo total do teste                 : ${totalElapsedSec}s`);
  console.log(`Total de requisições enviadas         : ${results.length}`);
  console.log(`Requisições que PASSARAM antes do 429  : ${passedCount}`);
  console.log(`Recebeu 429 em algum momento?          : ${gotBlocked ? "SIM" : "NÃO (limite do script atingido sem bloqueio)"}`);
  console.log(`Valor configurado no painel (informado): ${args.configured}`);
  console.log("\nDistribuição por error_code / status:");
  for (const [key, count] of Object.entries(errorCodeCounts)) {
    console.log(`  ${key}: ${count}`);
  }
  console.log("");

  if (!gotBlocked) {
    console.log(
      `FALHA DE PROTEÇÃO CONFIRMADA: nenhuma resposta 429 apareceu em ${results.length} tentativas seguidas ` +
      `contra o mesmo e-mail/IP. O rate limit configurado (${args.configured}) NÃO está sendo aplicado na prática.`
    );
    process.exitCode = 2;
  } else {
    console.log(`O sign-in foi bloqueado (429) após ${passedCount} requisições que passaram.`);
    console.log(
      `Compare esse número com o valor configurado no painel (${args.configured}). ` +
      `Se o número real for muito maior que o configurado, isso é uma falha de proteção real, não só um detalhe técnico.`
    );
  }
}

main();
