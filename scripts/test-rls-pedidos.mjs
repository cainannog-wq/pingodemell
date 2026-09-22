// Teste automatizado de RLS (Row Level Security) para a tabela "pedidos".
//
// Prova:
//   1. INSERT anônimo funciona (é assim que o pedido nasce, sem login)
//   2. SELECT anônimo é bloqueado
//   3. UPDATE anônimo é bloqueado
//   4. DELETE anônimo é bloqueado
//   5. SELECT autenticado funciona
//   6. UPDATE autenticado funciona
//   7. DELETE autenticado funciona (e limpa o pedido de teste no processo)
//
// Para os testes 5-7 é preciso uma sessão autenticada de verdade (role
// "authenticated" no Postgres, não só a service role). Não dá pra usar
// signInWithPassword aqui porque o Auth deste projeto exige um token real
// do Turnstile (ver scripts/seed-produtos-demo.mjs) — e resolver esse
// desafio automaticamente seria justamente o tipo de bypass de CAPTCHA que
// não deve ser feito. Em vez disso, a service role key (que já tem acesso
// irrestrito ao banco, ignorando RLS) é usada só para gerar um magic link
// via Admin API e trocá-lo por uma sessão real do usuário de teste — um
// fluxo de admin server-to-server, não o formulário público de login, e
// estritamente menos acesso do que a própria service role key já tem.
//
// Uso: node scripts/test-rls-pedidos.mjs

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

function pedidoDeTeste() {
  const marca = `RLS_TEST_${Date.now()}`;
  return {
    cliente_nome: marca,
    cliente_whatsapp: "(41) 90000-0000",
    cliente_email: null,
    ocasiao: "Pedido de teste — scripts/test-rls-pedidos.mjs",
    modo_entrega: "retirada",
    endereco: null,
    data_hora_entrega: new Date(Date.now() + 86400000).toISOString(),
    forma_pagamento: "PIX",
    observacoes: null,
    itens: [{ nome: "Item de teste", variacao: null, quantidade: 1, preco_unitario: 1 }],
    subtotal: 1,
    valor_entrega: 0,
    total: 1,
  };
}

async function main() {
  console.log(`Testando RLS de 'pedidos' em ${supabaseUrl}\n`);
  console.log("=".repeat(70));

  const anon = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. INSERT anônimo deve funcionar.
  //
  // Sem .select() aqui de propósito: a policy de SELECT de 'pedidos' é
  // restrita a authenticated, e o Postgres aplica essa mesma policy ao
  // RETURNING de um INSERT — pedir o registro de volta (.insert().select())
  // faria o insert anônimo falhar com "new row violates row-level security
  // policy" mesmo sendo permitido, um efeito colateral da RLS de leitura,
  // não do INSERT em si. Por isso o pedido "de verdade" (Route Handler em
  // src/app/api/pedidos/route.ts) usa a service role pra gravar, não a
  // anon key — só este teste aqui precisa do INSERT anônimo puro, pra
  // provar exatamente a policy pública exigida no escopo.
  const pedidoTeste = pedidoDeTeste();
  const { error: insertError } = await anon.from("pedidos").insert(pedidoTeste);

  report(
    "1. INSERT anônimo em 'pedidos' deve funcionar",
    insertError === null,
    insertError ? `Erro inesperado: ${JSON.stringify(insertError)}` : "OK — insert aceito."
  );

  if (insertError) {
    console.log("\nNão dá pra continuar os demais testes sem um pedido de teste criado. Abortando.");
    process.exitCode = 1;
    return;
  }

  // Busca o pedido recém-criado via service role (que enxerga tudo,
  // ignorando RLS) pelo nome-marca único, só pra saber o id/numero — o
  // client anônimo que inseriu não tem como ler de volta (ver acima).
  const { data: inserted } = await admin
    .from("pedidos")
    .select("id, numero")
    .eq("cliente_nome", pedidoTeste.cliente_nome)
    .single();

  if (!inserted) {
    report("1b. Localizar o pedido de teste recém-criado", false, "Não encontrado nem via service role — algo grave está errado.");
    process.exitCode = 1;
    return;
  }

  const testId = inserted.id;

  // 2. SELECT anônimo deve ser bloqueado.
  {
    const { data, error } = await anon.from("pedidos").select("*").eq("id", testId);
    const bloqueado = error !== null || (data?.length ?? 0) === 0;
    report(
      "2. SELECT anônimo em 'pedidos' deve ser bloqueado",
      bloqueado,
      error
        ? `OK — select rejeitado. code=${error.code} message="${error.message}"`
        : bloqueado
          ? "OK — nenhuma linha retornada (RLS filtrou, sem erro explícito)."
          : `FALHA — o anônimo conseguiu ler o pedido #${inserted.numero}.`
    );
  }

  // 3. UPDATE anônimo deve ser bloqueado.
  {
    const { error } = await anon.from("pedidos").update({ status: "cancelado" }).eq("id", testId);
    const { data: check } = await admin.from("pedidos").select("status").eq("id", testId).single();
    const bloqueado = check?.status !== "cancelado";
    report(
      "3. UPDATE anônimo em 'pedidos' deve ser bloqueado",
      bloqueado,
      bloqueado
        ? `OK — status continua "${check?.status}"${error ? ` (update também retornou erro: ${error.message})` : " (update foi aceito sem erro, mas não alterou nenhuma linha)"}.`
        : `FALHA — o anônimo mudou o status do pedido #${inserted.numero} para "cancelado".`
    );
  }

  // 4. DELETE anônimo deve ser bloqueado.
  {
    const { error } = await anon.from("pedidos").delete().eq("id", testId);
    const { data: check } = await admin.from("pedidos").select("id").eq("id", testId).maybeSingle();
    const bloqueado = !!check;
    report(
      "4. DELETE anônimo em 'pedidos' deve ser bloqueado",
      bloqueado,
      bloqueado
        ? `OK — o pedido #${inserted.numero} continua na tabela${error ? ` (delete também retornou erro: ${error.message})` : " (delete foi aceito sem erro, mas não apagou nenhuma linha)"}.`
        : `FALHA — o anônimo apagou o pedido #${inserted.numero}.`
    );
  }

  // Estabelece uma sessão autenticada de verdade para os testes 5-7 (ver
  // comentário no topo do arquivo sobre por que via magic link).
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: testAdminEmail,
  });

  if (linkError || !linkData?.properties?.hashed_token) {
    report(
      "5-7. Testes autenticados",
      false,
      `Não foi possível gerar sessão de teste para ${testAdminEmail}: ${linkError?.message ?? "hashed_token ausente na resposta"}`
    );
  } else {
    const authed = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error: verifyError } = await authed.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: "magiclink",
    });

    if (verifyError) {
      report("5-7. Testes autenticados", false, `Falha ao trocar o magic link por sessão: ${verifyError.message}`);
    } else {
      // 5. SELECT autenticado deve funcionar.
      const { data: selectData, error: selectError } = await authed.from("pedidos").select("*").eq("id", testId);
      report(
        "5. SELECT autenticado em 'pedidos' deve funcionar",
        selectError === null && (selectData?.length ?? 0) === 1,
        selectError
          ? `Erro inesperado: ${JSON.stringify(selectError)}`
          : `OK — ${selectData?.length ?? 0} linha(s) retornada(s) para o pedido #${inserted.numero}.`
      );

      // 6. UPDATE autenticado deve funcionar.
      const { error: updateError } = await authed
        .from("pedidos")
        .update({ status: "em_producao" })
        .eq("id", testId);
      const { data: afterUpdate } = await admin.from("pedidos").select("status").eq("id", testId).single();
      const updateOk = updateError === null && afterUpdate?.status === "em_producao";
      report(
        "6. UPDATE autenticado em 'pedidos' deve funcionar",
        updateOk,
        updateError
          ? `Erro inesperado: ${JSON.stringify(updateError)}`
          : `OK — status atualizado para "${afterUpdate?.status}".`
      );

      // 7. DELETE autenticado deve funcionar (limpa o pedido de teste).
      const { error: deleteError } = await authed.from("pedidos").delete().eq("id", testId);
      const { data: afterDelete } = await admin.from("pedidos").select("id").eq("id", testId).maybeSingle();
      const deleteOk = deleteError === null && !afterDelete;
      report(
        "7. DELETE autenticado em 'pedidos' deve funcionar",
        deleteOk,
        deleteError
          ? `Erro inesperado: ${JSON.stringify(deleteError)}`
          : deleteOk
            ? `OK — pedido #${inserted.numero} de teste removido.`
            : `FALHA — o pedido #${inserted.numero} ainda existe depois do delete.`
      );

      await authed.auth.signOut();
    }
  }

  console.log("\n" + "=".repeat(70));
  const failed = results.filter((r) => !r.passed);
  console.log(`\nResumo: ${results.length - failed.length}/${results.length} testes passaram.`);

  if (failed.length > 0) {
    console.log("Falharam:", failed.map((f) => f.name).join(", "));
    // Se algo falhou antes da limpeza (teste 7) rodar de verdade, apaga o
    // pedido de teste via service role pra não sujar o histórico real.
    await admin.from("pedidos").delete().eq("id", testId);
    process.exit(1);
  }
}

main().catch(async (err) => {
  console.error("Erro inesperado ao rodar os testes:", err);
  process.exit(1);
});
