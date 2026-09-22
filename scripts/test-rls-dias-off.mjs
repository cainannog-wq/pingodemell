// Teste automatizado de RLS (Row Level Security) para as tabelas
// "dias_off" e "segunda_reaberturas".
//
// Prova, para cada uma das duas tabelas:
//   1. SELECT anônimo funciona (leitura pública, mesmo padrão de "produtos")
//   2. INSERT anônimo é bloqueado
//   3. DELETE anônimo é bloqueado
//   4. INSERT autenticado funciona
//   5. UPDATE autenticado funciona (usado pela observação editável inline)
//   6. SELECT autenticado enxerga o registro com a observação atualizada
//   7. DELETE autenticado funciona (e limpa o registro de teste no processo)
//
// Sessão autenticada de teste obtida via magic link (Admin API), mesmo
// mecanismo de scripts/test-rls-pedidos.mjs — ver comentário lá para o
// motivo de não usar signInWithPassword aqui.
//
// Uso: node scripts/test-rls-dias-off.mjs

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

// dias_off não aceita segunda-feira (constraint dias_off_nao_pode_ser_segunda
// — segunda usa o mecanismo separado de reabertura). Data de teste bem no
// futuro, ajustada pra nunca cair numa segunda, pra não colidir com dado
// real nem violar a constraint.
function dataDeTesteDiaOff() {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 5);
  while (d.getDay() === 1) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

// segunda_reaberturas exige segunda-feira (constraint
// segunda_reaberturas exige extract(dow from data) = 1).
function dataDeTesteReabertura() {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 5);
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function testarTabela({ tabela, dataTeste, authed, admin, anon }) {
  console.log(`\n${"-".repeat(70)}\nTabela: ${tabela} (data de teste: ${dataTeste})\n${"-".repeat(70)}`);

  // Garante que não sobrou lixo de uma rodada anterior interrompida.
  await admin.from(tabela).delete().eq("data", dataTeste);

  // 1. SELECT anônimo deve funcionar (leitura pública).
  {
    const { data, error } = await anon.from(tabela).select("id").limit(1);
    report(
      `[${tabela}] 1. SELECT anônimo deve funcionar`,
      error === null,
      error ? `Erro inesperado: ${JSON.stringify(error)}` : `OK — select aceito (${data?.length ?? 0} linha(s) na amostra).`
    );
  }

  // 2. INSERT anônimo deve ser bloqueado.
  {
    const { error } = await anon.from(tabela).insert({ data: dataTeste });
    const { data: check } = await admin.from(tabela).select("id").eq("data", dataTeste).maybeSingle();
    const bloqueado = !check;
    report(
      `[${tabela}] 2. INSERT anônimo deve ser bloqueado`,
      bloqueado,
      bloqueado
        ? `OK — nenhum registro criado${error ? ` (insert também retornou erro: ${error.message})` : ""}.`
        : `FALHA — o anônimo conseguiu inserir ${dataTeste}.`
    );
  }

  // 3. DELETE anônimo deve ser bloqueado (usando um registro criado via
  // service role, já que o anônimo não conseguiu criar nada acima).
  {
    await admin.from(tabela).insert({ data: dataTeste });
    const { error } = await anon.from(tabela).delete().eq("data", dataTeste);
    const { data: check } = await admin.from(tabela).select("id").eq("data", dataTeste).maybeSingle();
    const bloqueado = !!check;
    report(
      `[${tabela}] 3. DELETE anônimo deve ser bloqueado`,
      bloqueado,
      bloqueado
        ? `OK — o registro continua na tabela${error ? ` (delete também retornou erro: ${error.message})` : ""}.`
        : `FALHA — o anônimo apagou ${dataTeste}.`
    );
    // Limpa o registro semeado via service role antes dos testes autenticados.
    await admin.from(tabela).delete().eq("data", dataTeste);
  }

  if (!authed) {
    report(`[${tabela}] 4-7. Testes autenticados`, false, "Sessão autenticada de teste indisponível (ver erro acima).");
    return;
  }

  // 4. INSERT autenticado deve funcionar.
  const { data: insertedData, error: insertError } = await authed
    .from(tabela)
    .insert({ data: dataTeste })
    .select("id")
    .single();
  report(
    `[${tabela}] 4. INSERT autenticado deve funcionar`,
    insertError === null && !!insertedData,
    insertError ? `Erro inesperado: ${JSON.stringify(insertError)}` : `OK — registro ${dataTeste} criado (id ${insertedData?.id}).`
  );

  // 5. UPDATE autenticado deve funcionar (a observação é editável inline no
  // admin, precisa da policy de update além de insert/select/delete).
  const { error: updateError } = await authed
    .from(tabela)
    .update({ observacao: "observação de teste" })
    .eq("data", dataTeste);
  report(
    `[${tabela}] 5. UPDATE autenticado deve funcionar`,
    updateError === null,
    updateError ? `Erro inesperado: ${JSON.stringify(updateError)}` : "OK — update aceito."
  );

  // 6. SELECT autenticado deve enxergar a observação atualizada.
  const { data: selectData, error: selectError } = await authed
    .from(tabela)
    .select("id, observacao")
    .eq("data", dataTeste);
  const viuObservacao = (selectData?.length ?? 0) === 1 && selectData?.[0]?.observacao === "observação de teste";
  report(
    `[${tabela}] 6. SELECT autenticado deve enxergar a observação atualizada`,
    selectError === null && viuObservacao,
    selectError
      ? `Erro inesperado: ${JSON.stringify(selectError)}`
      : `OK — observação lida de volta: "${selectData?.[0]?.observacao}".`
  );

  // 7. DELETE autenticado deve funcionar (limpa o registro de teste).
  const { error: deleteError } = await authed.from(tabela).delete().eq("data", dataTeste);
  const { data: afterDelete } = await admin.from(tabela).select("id").eq("data", dataTeste).maybeSingle();
  const deleteOk = deleteError === null && !afterDelete;
  report(
    `[${tabela}] 7. DELETE autenticado deve funcionar`,
    deleteOk,
    deleteError
      ? `Erro inesperado: ${JSON.stringify(deleteError)}`
      : deleteOk
        ? `OK — registro de teste ${dataTeste} removido.`
        : `FALHA — o registro ${dataTeste} ainda existe depois do delete.`
  );
}

async function main() {
  console.log(`Testando RLS de 'dias_off' e 'segunda_reaberturas' em ${supabaseUrl}`);

  const anon = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Estabelece uma sessão autenticada de verdade, reaproveitada nas duas tabelas.
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

  await testarTabela({ tabela: "dias_off", dataTeste: dataDeTesteDiaOff(), authed, admin, anon });
  await testarTabela({ tabela: "segunda_reaberturas", dataTeste: dataDeTesteReabertura(), authed, admin, anon });

  if (authed) await authed.auth.signOut();

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
