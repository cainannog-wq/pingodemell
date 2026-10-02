// Busca cada produto pelo slug, com a MESMA consulta de
// buscarProdutoPorSlug (src/lib/vitrine/buscar.ts: slug + ativo = true),
// em dois papéis:
//   - visitante anônimo (chave anon, sem sessão);
//   - chave de serviço, que lê tudo como o admin logado navegando no site
//     (é aí que o filtro de ativo na consulta faz diferença).
// Esperado: ativo devolve o produto; inativo e slug inexistente, vazio.
// Só leitura (select), nada é gravado.
//
// Uso: node scripts/ver-slugs.mjs

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const linha of readFileSync(new URL("../.env.local", import.meta.url), "utf-8").split("\n")) {
  const i = linha.indexOf("=");
  if (i > 0 && !linha.trim().startsWith("#")) {
    const chave = linha.slice(0, i).trim();
    if (!(chave in process.env)) process.env[chave] = linha.slice(i + 1).trim();
  }
}

const opcoes = { auth: { autoRefreshToken: false, persistSession: false } };
const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, opcoes);
const servico = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, opcoes);
const CAMPOS = "id, slug, nome, ativo";

async function buscar(cliente, slug) {
  const { data, error } = await cliente.from("produtos").select(CAMPOS).eq("slug", slug).eq("ativo", true).maybeSingle();
  if (error) return `ERRO ${error.message}`;
  return data ? `devolve "${data.nome}"` : "vazio";
}

const { data: todos, error } = await servico.from("produtos").select(CAMPOS).order("nome");
if (error) {
  console.error("Não leu os produtos:", error.message);
  process.exit(1);
}

console.log(`${new Date().toISOString()} — busca por slug (slug + ativo = true), ${todos.length} produtos + 1 inexistente\n`);
let falhas = 0;
const casos = [...todos, { nome: "(slug inexistente)", slug: "produto-que-nao-existe", ativo: false }];
for (const p of casos) {
  const [comoAnon, comoAdmin] = await Promise.all([buscar(anon, p.slug), buscar(servico, p.slug)]);
  const esperado = p.ativo ? `devolve "${p.nome}"` : "vazio";
  const ok = comoAnon === esperado && comoAdmin === esperado;
  if (!ok) falhas += 1;
  console.log(
    `${ok ? "ok  " : "ERRO"} ${String(p.slug).padEnd(30)} ${p.ativo ? "ativo  " : "inativo"} anônimo: ${comoAnon.padEnd(40)} admin (lê tudo): ${comoAdmin}`
  );
}
console.log(`\n${falhas === 0 ? "Tudo como esperado" : `${falhas} caso(s) fora do esperado`}. Nada foi gravado.`);
if (falhas) process.exitCode = 1;
