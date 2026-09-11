// Cria (ou reaproveita) uma conta de teste no Supabase Auth, só pra validar
// login por e-mail+senha e o CRUD de produtos — sem mexer na conta pessoal
// do dono do projeto (que usa GitHub OAuth e não tem senha).
//
// Precisa da SUPABASE_SERVICE_ROLE_KEY (cole em .env.local, nunca commitada).
//
// Uso: node scripts/create-test-admin.mjs

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const envPath = path.join(projectRoot, ".env.local");

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

const dotenv = loadDotEnv(envPath);
function getEnv(name) {
  return process.env[name] || dotenv[name] || "";
}

const SUPABASE_URL = getEnv("SUPABASE_URL");
const SERVICE_ROLE_KEY = getEnv("SUPABASE_SERVICE_ROLE_KEY");
const TEST_ADMIN_EMAIL = getEnv("TEST_ADMIN_EMAIL") || "admin.teste@pingodemell.com.br";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "ERRO: SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY não encontrados (env ou .env.local)."
  );
  console.error("Cole a service role key em .env.local como SUPABASE_SERVICE_ROLE_KEY=... e rode de novo.");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function generatePassword() {
  return randomBytes(12).toString("base64url");
}

function upsertEnvLine(name, value) {
  const content = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  const lines = content.split(/\r?\n/);
  const idx = lines.findIndex((l) => l.trim().startsWith(`${name}=`));
  const line = `${name}=${value}`;
  if (idx >= 0) {
    lines[idx] = line;
    return lines.join("\n");
  }
  const sep = content.endsWith("\n") || content === "" ? "" : "\n";
  return content + sep + line + "\n";
}

async function main() {
  console.log(`Verificando se ${TEST_ADMIN_EMAIL} já existe...`);

  let userId = null;
  let page = 1;
  while (!userId) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email === TEST_ADMIN_EMAIL);
    if (found) userId = found.id;
    if (data.users.length < 200) break;
    page += 1;
  }

  const password = getEnv("TEST_ADMIN_PASSWORD") || generatePassword();

  if (userId) {
    console.log(`Conta já existe (id=${userId}). Redefinindo a senha...`);
    const { error } = await admin.auth.admin.updateUserById(userId, { password });
    if (error) throw error;
  } else {
    console.log("Criando conta de teste...");
    const { data, error } = await admin.auth.admin.createUser({
      email: TEST_ADMIN_EMAIL,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user.id;
  }

  // Grava e-mail e senha de teste no .env.local (gitignored) para os
  // scripts de teste automatizado usarem.
  const withEmail = upsertEnvLine("TEST_ADMIN_EMAIL", TEST_ADMIN_EMAIL);
  const withPassword = (() => {
    const lines = withEmail.split(/\r?\n/);
    const idx = lines.findIndex((l) => l.trim().startsWith("TEST_ADMIN_PASSWORD="));
    const line = `TEST_ADMIN_PASSWORD=${password}`;
    if (idx >= 0) {
      lines[idx] = line;
    } else {
      lines.push(line);
    }
    return lines.join("\n");
  })();

  const fs = await import("node:fs/promises");
  await fs.writeFile(envPath, withPassword.replace(/\n{3,}/g, "\n\n"));

  console.log("\n=== Conta de teste pronta ===");
  console.log(`E-mail : ${TEST_ADMIN_EMAIL}`);
  console.log(`Senha  : ${password}`);
  console.log("\n(gravado em .env.local como TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD — não commitado)");
}

main().catch((err) => {
  console.error("Erro ao criar/atualizar conta de teste:", err);
  process.exit(1);
});
