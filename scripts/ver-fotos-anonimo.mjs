// Mostra, como visitante anônimo (chave anon, sem sessão), as fotos extras
// que a API devolve para um produto, na ordem da posição. Só leitura.
// Usado nas provas da galeria (produto ativo devolve a lista; inativo,
// vazio).
//
// Uso: node scripts/ver-fotos-anonimo.mjs <id do produto>

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const linha of readFileSync(new URL("../.env.local", import.meta.url), "utf-8").split("\n")) {
  const i = linha.indexOf("=");
  if (i > 0 && !linha.trim().startsWith("#")) {
    const chave = linha.slice(0, i).trim();
    if (!(chave in process.env)) process.env[chave] = linha.slice(i + 1).trim();
  }
}

const produtoId = process.argv[2];
if (!produtoId) {
  console.error("Uso: node scripts/ver-fotos-anonimo.mjs <id do produto>");
  process.exit(1);
}

const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data, error } = await anon
  .from("produto_fotos")
  .select("posicao, caminho")
  .eq("produto_id", produtoId)
  .order("posicao", { ascending: true });

console.log(`${new Date().toISOString()} — anônimo, produto ${produtoId}:`);
if (error) console.log("erro:", error.message);
else console.log(JSON.stringify(data.map((f) => `${f.posicao}: ${f.caminho.split("/").pop()}`), null, 2));
