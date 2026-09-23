// Teste automatizado de RLS (Row Level Security) para a tabela
// "produto_cento_itens" (subitens de um produto tipo "Cento").
//
// Mesmo padrão de scripts/test-rls-dias-off.mjs: leitura pública, escrita
// restrita a usuário autenticado. Prova:
//   1. SELECT anônimo funciona (leitura pública)
//   2. INSERT anônimo é bloqueado
//   3. DELETE anônimo é bloqueado
//   4. INSERT autenticado funciona
//   5. SELECT autenticado enxerga o item inserido
//   6. DELETE autenticado funciona (e limpa o registro de teste no processo)
//
// Como cento_nome/subitem_nome são FK para produtos(nome), o script cria
// (via service role) dois produtos de teste descartáveis antes de rodar os
// testes acima, e apaga os dois no final — o "on delete cascade" da FK já
// limparia produto_cento_itens sozinho, mas a limpeza é explícita mesmo
// assim, pra deixar o rastro claro no log.
//
// Sessão autenticada de teste obtida via magic link (Admin API), mesmo
// mecanismo de scripts/test-rls-pedidos.mjs.
//
// Uso: node scripts/test-rls-produto-cento-itens.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function loadEnvLocal() {
  const envPath = path.join(rootDir, ".env.local");
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const testAdminEmail = process.env.TEST_ADMIN_EMAIL;

if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
  console.error("Faltam SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY em .env.local");
  process.exit(1);
}
if (!testAdminEmail) {
  console.error("Falta TEST_ADMIN_EMAIL em .env.local — rode primeiro: node scripts/create-test-admin.mjs");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const results = [];
function report(name, passed, detail) {
  results.push({ name, passed });
  console.log(`\n[${passed ? "PASS" : "FAIL"}] ${name}`);
  if (detail) console.log(detail);
}

async function main() {
  console.log(`Testando RLS de 'produto_cento_itens' em ${supabaseUrl}`);

  const anon = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const centoNome = `RLS_TEST_CENTO_${Date.now()}`;
  const subitemNome = `RLS_TEST_SUBITEM_${Date.now()}`;

  // Produtos de apoio descartáveis (a FK exige que existam de verdade).
  // As duas linhas do insert em lote precisam das MESMAS colunas: se uma
  // omitir "tipo" e a outra não, o PostgREST manda NULL em vez de aplicar
  // o default da coluna nessa linha, e o insert inteiro falha (a
  // constraint not null de "tipo" rejeita as duas de uma vez).
  const { error: seedError } = await admin.from("produtos").insert([
    { nome: centoNome, preco: 1, pedido_minimo: 1, tipo: "cento" },
    { nome: subitemNome, preco: 1, pedido_minimo: 1, tipo: "normal" },
  ]);
  if (seedError) {
    console.error(`Falha ao criar produtos de apoio para o teste: ${seedError.message}`);
    process.exit(1);
  }

  // 1. SELECT anônimo deve funcionar (leitura pública).
  {
    const { data, error } = await anon.from("produto_cento_itens").select("id").limit(1);
    report(
      "1. SELECT anônimo deve funcionar",
      error === null,
      error ? `Erro inesperado: ${JSON.stringify(error)}` : `OK — select aceito (${data?.length ?? 0} linha(s) na amostra).`
    );
  }

  // 2. INSERT anônimo deve ser bloqueado.
  {
    const { error } = await anon
      .from("produto_cento_itens")
      .insert({ cento_nome: centoNome, subitem_nome: subitemNome, ordem: 0 });
    const { data: check } = await admin
      .from("produto_cento_itens")
      .select("id")
      .eq("cento_nome", centoNome)
      .maybeSingle();
    const bloqueado = !check;
    report(
      "2. INSERT anônimo deve ser bloqueado",
      bloqueado,
      bloqueado
        ? `OK — nenhum registro criado${error ? ` (insert também retornou erro: ${error.message})` : ""}.`
        : `FALHA — o anônimo conseguiu inserir um item de cento.`
    );
  }

  // 3. DELETE anônimo deve ser bloqueado (usando um registro criado via
  // service role, já que o anônimo não conseguiu criar nada acima).
  {
    await admin.from("produto_cento_itens").insert({ cento_nome: centoNome, subitem_nome: subitemNome, ordem: 0 });
    const { error } = await anon.from("produto_cento_itens").delete().eq("cento_nome", centoNome);
    const { data: check } = await admin
      .from("produto_cento_itens")
      .select("id")
      .eq("cento_nome", centoNome)
      .maybeSingle();
    const bloqueado = !!check;
    report(
      "3. DELETE anônimo deve ser bloqueado",
      bloqueado,
      bloqueado
        ? `OK — o registro continua na tabela${error ? ` (delete também retornou erro: ${error.message})` : ""}.`
        : `FALHA — o anônimo apagou o item de cento.`
    );
    // Limpa o registro semeado via service role antes dos testes autenticados.
    await admin.from("produto_cento_itens").delete().eq("cento_nome", centoNome);
  }

  // Estabelece uma sessão autenticada de verdade.
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: testAdminEmail,
  });

  let authed = null;
  if (linkError || !linkData?.properties?.hashed_token) {
    report(
      "Sessão autenticada de teste",
      false,
      `Não foi possível gerar sessão de teste para ${testAdminEmail}: ${linkError?.message ?? "hashed_token ausente na resposta"}`
    );
  } else {
    const client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: verifyError } = await client.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: "magiclink",
    });
    if (verifyError) {
      report("Sessão autenticada de teste", false, `Falha ao trocar o magic link por sessão: ${verifyError.message}`);
    } else {
      authed = client;
    }
  }

  if (authed) {
    // 4. INSERT autenticado deve funcionar.
    const { data: insertedData, error: insertError } = await authed
      .from("produto_cento_itens")
      .insert({ cento_nome: centoNome, subitem_nome: subitemNome, ordem: 0 })
      .select("id")
      .single();
    report(
      "4. INSERT autenticado deve funcionar",
      insertError === null && !!insertedData,
      insertError ? `Erro inesperado: ${JSON.stringify(insertError)}` : `OK — item criado (id ${insertedData?.id}).`
    );

    // 5. SELECT autenticado deve enxergar o item inserido.
    const { data: selectData, error: selectError } = await authed
      .from("produto_cento_itens")
      .select("id, subitem_nome")
      .eq("cento_nome", centoNome);
    const viuItem = (selectData?.length ?? 0) === 1 && selectData?.[0]?.subitem_nome === subitemNome;
    report(
      "5. SELECT autenticado deve enxergar o item inserido",
      selectError === null && viuItem,
      selectError ? `Erro inesperado: ${JSON.stringify(selectError)}` : `OK — item lido de volta: "${selectData?.[0]?.subitem_nome}".`
    );

    // 6. DELETE autenticado deve funcionar (limpa o registro de teste).
    const { error: deleteError } = await authed.from("produto_cento_itens").delete().eq("cento_nome", centoNome);
    const { data: afterDelete } = await admin
      .from("produto_cento_itens")
      .select("id")
      .eq("cento_nome", centoNome)
      .maybeSingle();
    const deleteOk = deleteError === null && !afterDelete;
    report(
      "6. DELETE autenticado deve funcionar",
      deleteOk,
      deleteError
        ? `Erro inesperado: ${JSON.stringify(deleteError)}`
        : deleteOk
          ? "OK — item de teste removido."
          : "FALHA — o item ainda existe depois do delete."
    );

    await authed.auth.signOut();
  } else {
    report("4-6. Testes autenticados", false, "Sessão autenticada de teste indisponível (ver erro acima).");
  }

  // Limpeza final: apaga os produtos de apoio (cascade já limparia
  // produto_cento_itens sozinho, mas fica explícito no log).
  await admin.from("produto_cento_itens").delete().in("cento_nome", [centoNome]);
  await admin.from("produtos").delete().in("nome", [centoNome, subitemNome]);

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
