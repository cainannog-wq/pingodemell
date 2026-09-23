// Cadastra produtos de demonstração para o tipo "Cento": três produtos
// normais (usados como subitens) e um produto "Cento" já referenciando os
// três, pra dar pra abrir e clicar no CRUD sem precisar cadastrar nada
// manualmente antes de validar. Idempotente: pula o que já existir.
//
// Usa a service role key (bypassa RLS), mesmo motivo de
// seed-produtos-demo.mjs (Auth deste projeto exige captcha real do
// Turnstile em todo signInWithPassword).
//
// Requisito em .env.local: SUPABASE_SERVICE_ROLE_KEY.
//
// Uso: node scripts/seed-produto-cento-demo.mjs

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

const SUBITENS_DEMO = [
  {
    nome: "Coxinha de frango",
    preco: 4.5,
    descricao: "Coxinha de frango tradicional, massa de batata.",
    pedido_minimo: 1,
    Categoria: "Salgados",
  },
  {
    nome: "Risole de carne",
    preco: 4.5,
    descricao: "Risole de carne moída temperada, empanado e frito.",
    pedido_minimo: 1,
    Categoria: "Salgados",
  },
  {
    nome: "Empada de palmito",
    preco: 4.5,
    descricao: "Empada individual de palmito, massa amanteigada.",
    pedido_minimo: 1,
    Categoria: "Salgados",
  },
];

const CENTO_DEMO = {
  nome: "Cento de salgados sortidos",
  preco: 95.0,
  descricao: "Cento (100 unidades) sortido com coxinha, risole e empada.",
  pedido_minimo: 1,
  Categoria: "Salgados",
  tipo: "cento",
};

async function cadastrarSeNaoExiste(produto) {
  const { data: existing } = await supabase.from("produtos").select("nome").eq("nome", produto.nome).maybeSingle();

  if (existing) {
    console.log(`- "${produto.nome}" já existe, pulando.`);
    return;
  }

  const { error } = await supabase.from("produtos").insert(produto);
  if (error) {
    console.error(`- ERRO ao cadastrar "${produto.nome}": ${error.message}`);
  } else {
    console.log(`- "${produto.nome}" cadastrado.`);
  }
}

async function main() {
  for (const produto of SUBITENS_DEMO) {
    await cadastrarSeNaoExiste(produto);
  }
  await cadastrarSeNaoExiste(CENTO_DEMO);

  const { data: itensExistentes } = await supabase
    .from("produto_cento_itens")
    .select("subitem_nome")
    .eq("cento_nome", CENTO_DEMO.nome);

  const jaTem = new Set((itensExistentes ?? []).map((i) => i.subitem_nome));
  const faltando = SUBITENS_DEMO.map((s) => s.nome).filter((nome) => !jaTem.has(nome));

  if (faltando.length === 0) {
    console.log(`- Subitens de "${CENTO_DEMO.nome}" já estão completos, pulando.`);
  } else {
    const proximaOrdem = jaTem.size;
    const { error } = await supabase.from("produto_cento_itens").insert(
      faltando.map((subitem_nome, index) => ({
        cento_nome: CENTO_DEMO.nome,
        subitem_nome,
        ordem: proximaOrdem + index,
      }))
    );
    if (error) {
      console.error(`- ERRO ao vincular subitens de "${CENTO_DEMO.nome}": ${error.message}`);
    } else {
      console.log(`- Subitens vinculados a "${CENTO_DEMO.nome}": ${faltando.join(", ")}.`);
    }
  }

  console.log("\nPronto.");
}

main().catch((err) => {
  console.error("Erro inesperado:", err);
  process.exit(1);
});
