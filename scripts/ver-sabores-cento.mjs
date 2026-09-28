// Sabores de cada produto tipo Cento, com a MESMA consulta do site
// (CAMPOS_SABOR em src/lib/vitrine/cento.ts: produto_cento_itens com o
// produto do sabor embutido pela chave estrangeira do subitem), em dois
// papéis:
//   - visitante anônimo (chave anon, sem sessão): a RLS de produtos esconde
//     o sabor inativo, que volta como null no campo "sabor";
//   - chave de serviço, que lê tudo como o admin logado navegando no site:
//     o sabor inativo volta com ativo = false, e é o código que o tira.
// Esperado: "ativos" igual nos dois papéis; Cento sem sabor ativo = indisponível.
// Só leitura (select), nada é gravado.
//
// Uso: node scripts/ver-sabores-cento.mjs

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

// Igual a CAMPOS_SABOR (src/lib/vitrine/cento.ts).
const CAMPOS_SABOR = "cento_nome, subitem_nome, ordem, sabor:produtos!produto_cento_itens_subitem_nome_fkey(nome, ativo)";

async function sabores(cliente, cento) {
  const { data, error } = await cliente
    .from("produto_cento_itens")
    .select(CAMPOS_SABOR)
    .eq("cento_nome", cento)
    .order("ordem", { ascending: true });
  if (error) return { erro: error.message };
  return {
    linhas: data.map((l) => `${l.subitem_nome} → ${l.sabor === null ? "null (escondido)" : l.sabor.ativo ? "ativo" : "inativo"}`),
    ativos: data.filter((l) => l.sabor?.ativo === true).map((l) => l.subitem_nome),
  };
}

const { data: centos, error } = await servico.from("produtos").select("nome, ativo").eq("tipo", "cento").order("nome");
if (error) {
  console.error("Não leu os Centos:", error.message);
  process.exit(1);
}

console.log(`${new Date().toISOString()} — sabores de ${centos.length} Cento(s)\n`);
for (const cento of centos) {
  console.log(`${cento.nome}${cento.ativo ? "" : " (inativo)"}`);
  for (const [papel, cliente] of [["anônimo", anon], ["serviço", servico]]) {
    const r = await sabores(cliente, cento.nome);
    if (r.erro) {
      console.log(`  ${papel}: ERRO ${r.erro}`);
      continue;
    }
    console.log(`  ${papel}: ${r.linhas.join("; ") || "(nenhum)"}`);
    console.log(`    ativos: ${r.ativos.join(", ") || "nenhum → indisponível"}`);
  }
}
