// Cadastra alguns produtos de demonstração, pra dar pra clicar no CRUD sem
// precisar cadastrar nada manualmente antes de validar a entrega.
// Idempotente: pula produtos cujo nome já existe.
//
// Usa a service role key (bypassa RLS) só porque é um script de seed local,
// sem passar pelo Supabase Auth — o Auth deste projeto exige captcha_token
// real (Turnstile) em todo signInWithPassword, então não dá pra logar aqui
// como o admin de teste sem um clique humano de verdade no widget.
//
// Requisito em .env.local: SUPABASE_SERVICE_ROLE_KEY.
//
// Uso: node scripts/seed-produtos-demo.mjs

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

const SUPABASE_URL = getEnv("SUPABASE_URL");
const SERVICE_ROLE_KEY = getEnv("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("ERRO: faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY em .env.local.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PRODUTOS_DEMO = [
  {
    nome: "Bolo de Chocolate com Ninho",
    preco: 45.0,
    descricao: "Bolo inteiro de chocolate com recheio de creme de leite Ninho.",
    pedido_minimo: 1,
  },
  {
    nome: "Brigadeiro Gourmet (unidade)",
    preco: 3.5,
    descricao: "Brigadeiro gourmet enrolado na hora, granulado belga.",
    pedido_minimo: 10,
  },
  {
    nome: "Coxinha de Frango (cento)",
    preco: 90.0,
    descricao: "Coxinha de frango tradicional, massa de batata, vendida por cento.",
    pedido_minimo: 50,
  },
];

async function main() {
  for (const produto of PRODUTOS_DEMO) {
    const { data: existing } = await supabase
      .from("produtos")
      .select("nome")
      .eq("nome", produto.nome)
      .maybeSingle();

    if (existing) {
      console.log(`- "${produto.nome}" já existe, pulando.`);
      continue;
    }

    const { error } = await supabase.from("produtos").insert(produto);
    if (error) {
      console.error(`- ERRO ao cadastrar "${produto.nome}": ${error.message}`);
    } else {
      console.log(`- "${produto.nome}" cadastrado.`);
    }
  }

  console.log("\nPronto.");
}

main().catch((err) => {
  console.error("Erro inesperado:", err);
  process.exit(1);
});
