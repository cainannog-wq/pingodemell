// Camada HTTP da API do Supabase com a chave anônima (a que está no código
// do site), com chamadas que NUNCA gravam, em nenhum estado do banco:
//   - função chamada por GET: o PostgREST roda GET numa transação só de
//     leitura, então mesmo uma função que grava não consegue gravar;
//   - insert de pedido/produto com um valor inválido: se a permissão
//     existir, o valor inválido derruba o insert antes de qualquer linha
//     (e antes do contador de número de pedido); se não existir, a
//     recusa por permissão vem antes ainda;
//   - update/delete filtrando por um id que não existe.
// Esperado: o estado DEPOIS de supabase/seguranca-api.sql aplicada. Antes
// de aplicar, as verificações das correções falham (brecha ainda aberta),
// mas continuam sem gravar nada — scripts/banco/rodar-todos.mjs confere a
// contagem de linhas e o contador de pedidos antes e depois.
//
// Uso: node scripts/banco/http-sem-gravar.mjs

import { lerEnv, limpar, registrar, resumir } from "./lib.mjs";

const env = lerEnv();
if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
  console.error("Faltam SUPABASE_URL / SUPABASE_ANON_KEY no .env.local");
  process.exit(1);
}

const ID_INEXISTENTE = "00000000-0000-4000-8000-000000000000";
const cabecalhos = {
  apikey: env.SUPABASE_ANON_KEY,
  Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=minimal",
};

async function chamar(metodo, caminho, corpo) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${caminho}`, {
    method: metodo,
    headers: cabecalhos,
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const texto = await res.text();
  let json = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    // corpo não-JSON
  }
  return { status: res.status, codigo: json?.code ?? null, mensagem: json?.message ?? null, json };
}

const resumo = (r) => `HTTP ${r.status}${r.codigo ? ` ${r.codigo}` : ""}${r.mensagem ? ` — ${r.mensagem}` : ""}`;
const semPermissao = (r) => r.codigo === "42501";

console.log(`Chamadas HTTP com a chave anônima em ${env.SUPABASE_URL} (nenhuma grava)`);
console.log("=".repeat(70));

{
  const r = await chamar("GET", "rpc/registrar_tentativa_pedido?p_ip=prova-http&p_janela_segundos=600&p_limite=5");
  registrar("http 1. anônimo não executa registrar_tentativa_pedido", semPermissao(r), resumo(r));
}
{
  const r = await chamar("POST", "pedidos", {
    cliente_nome: "PROVA_HTTP",
    cliente_whatsapp: "41900000000",
    modo_entrega: "valor-invalido-de-proposito",
    data_hora_entrega: new Date().toISOString(),
    forma_pagamento: "PIX",
    itens: [{ nome: "x", quantidade: 1, preco_unitario: 1 }],
    subtotal: 1,
    total: 1,
  });
  registrar("http 2. anônimo não grava pedido direto em /rest/v1/pedidos (sem permissão)", semPermissao(r), resumo(r));
}
{
  const r = await chamar("GET", "pedidos?select=id&limit=1");
  registrar("http 3. anônimo não lê pedidos (sem permissão)", semPermissao(r), resumo(r));
}
{
  const r = await chamar("PATCH", `pedidos?id=eq.${ID_INEXISTENTE}`, { observacoes: "prova" });
  registrar("http 4. anônimo não altera pedido (sem permissão)", semPermissao(r), resumo(r));
}
{
  const r = await chamar("DELETE", `pedidos?id=eq.${ID_INEXISTENTE}`);
  registrar("http 5. anônimo não apaga pedido (sem permissão)", semPermissao(r), resumo(r));
}
for (const tabela of ["pedidos_rate_limit", "heartbeat"]) {
  const r = await chamar("GET", `${tabela}?limit=1`);
  registrar(`http 6. anônimo não lê ${tabela} (sem permissão)`, semPermissao(r), resumo(r));
}
{
  const r = await chamar("POST", "produtos", { nome: "PROVA_HTTP", preco: "nao-e-numero", pedido_minimo: 1 });
  registrar("http 7. anônimo não grava produto (sem permissão)", semPermissao(r), resumo(r));
}
{
  const r = await chamar("GET", `rpc/salvar_produto_fotos?p_produto_id=${ID_INEXISTENTE}&p_fotos=[]`);
  registrar("http 8. anônimo não executa salvar_produto_fotos", semPermissao(r), resumo(r));
}
{
  const r = await chamar("GET", "rpc/rls_auto_enable");
  registrar("http 9. anônimo não executa rls_auto_enable (sem permissão)", semPermissao(r), resumo(r));
}
{
  const r = await chamar("GET", "produtos?select=nome,ativo");
  const lista = Array.isArray(r.json) ? r.json : [];
  registrar(
    "http 10. anônimo lê produtos, e só ativos (site público)",
    r.status === 200 && lista.length > 0 && lista.every((p) => p.ativo === true),
    `HTTP ${r.status}, ${lista.length} produto(s), inativos: ${lista.filter((p) => p.ativo !== true).length}`
  );
}
for (const tabela of ["produto_fotos", "produto_cento_itens", "dias_off", "segunda_reaberturas"]) {
  const r = await chamar("GET", `${tabela}?select=id&limit=1`);
  registrar(`http 11. anônimo lê ${tabela} (leitura pública)`, r.status === 200, limpar(resumo(r)));
}

resumir("Nada foi gravado.");
