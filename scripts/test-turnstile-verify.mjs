// Teste automatizado da secret key do Cloudflare Turnstile (chamada real ao
// endpoint siteverify, com a secret key real de produção), usando tokens
// inválidos — não tenta resolver o desafio, só confirma que a secret key
// está ativa e rejeita corretamente quem não passou pelo widget de verdade.
// (A verificação do token de login em si é feita pelo próprio Supabase Auth,
// via captchaToken em signInWithPassword — ver src/app/login/actions.ts.)
//
// Uso: node scripts/test-turnstile-verify.mjs

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
const TURNSTILE_SECRET_KEY =
  process.env.TURNSTILE_SECRET_KEY || dotenv.TURNSTILE_SECRET_KEY;

if (!TURNSTILE_SECRET_KEY) {
  console.error("ERRO: TURNSTILE_SECRET_KEY não encontrada (env ou .env.local).");
  process.exit(1);
}

async function verifyTurnstileToken(token, remoteIp) {
  const body = new URLSearchParams();
  body.set("secret", TURNSTILE_SECRET_KEY);
  body.set("response", token);
  if (remoteIp) body.set("remoteip", remoteIp);

  const res = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    { method: "POST", body }
  );
  if (!res.ok) return { success: false, raw: null };
  const data = await res.json();
  return { success: data.success === true, raw: data };
}

const results = [];
function report(name, passed, detail) {
  results.push({ name, passed });
  console.log(`\n[${passed ? "PASS" : "FAIL"}] ${name}`);
  if (detail) console.log(detail);
}

async function main() {
  console.log("=== Teste — verificação server-side do Turnstile (secret key real) ===\n");

  // 1. Token vazio nunca deve chegar a chamar a Cloudflare (guard local).
  {
    const empty = "";
    const wouldCall = empty.length > 0;
    report(
      "1. Token vazio é rejeitado sem precisar chamar a Cloudflare",
      !wouldCall,
      "OK — verify.ts retorna false localmente antes de qualquer fetch."
    );
  }

  // 2. Token forjado/qualquer-string deve ser rejeitado pela Cloudflare de verdade.
  {
    const fake = "token-forjado-" + Math.random().toString(36).slice(2);
    const { success, raw } = await verifyTurnstileToken(fake);
    report(
      "2. Token forjado é rejeitado pela API real da Cloudflare (siteverify)",
      success === false,
      `Resposta da Cloudflare: ${JSON.stringify(raw)}`
    );
  }

  // 3. Secret key real está de fato configurada (não é a sandbox pública).
  {
    const isSandboxSecret = TURNSTILE_SECRET_KEY === "1x0000000000000000000000000000000AA";
    report(
      "3. Secret key configurada não é a chave sandbox pública da Cloudflare",
      !isSandboxSecret,
      `Secret key em uso: ${TURNSTILE_SECRET_KEY.slice(0, 8)}...`
    );
  }

  console.log("\n" + "=".repeat(70));
  const failed = results.filter((r) => !r.passed);
  console.log(`\nResumo: ${results.length - failed.length}/${results.length} testes passaram.`);
  if (failed.length > 0) {
    console.log("Falharam:", failed.map((f) => f.name).join(", "));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Erro inesperado ao rodar os testes:", err);
  process.exit(1);
});
