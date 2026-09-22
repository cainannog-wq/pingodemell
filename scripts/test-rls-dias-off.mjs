// Teste automatizado de RLS (Row Level Security) para a tabela "dias_off".
//
// Prova:
//   1. SELECT anônimo funciona (leitura pública, mesmo padrão de "produtos")
//   2. INSERT anônimo é bloqueado
//   3. DELETE anônimo é bloqueado
//   4. INSERT autenticado funciona
//   5. SELECT autenticado enxerga o registro recém-criado
//   6. DELETE autenticado funciona (e limpa o registro de teste no processo)
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

// Data de teste bem no futuro, fora de qualquer intervalo usado por dados
// reais, para não colidir com um dia off de verdade já cadastrado.
function dataDeTeste() {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 5);
  return d.toISOString().slice(0, 10);
}

async function main() {
  console.log(`Testando RLS de 'dias_off' em ${supabaseUrl}\n`);
  console.log("=".repeat(70));

  const anon = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const dataTeste = dataDeTeste();

  // Garante que não sobrou lixo de uma rodada anterior interrompida.
  await admin.from("dias_off").delete().eq("data", dataTeste);

  // 1. SELECT anônimo deve funcionar (leitura pública).
  {
    const { data, error } = await anon.from("dias_off").select("id").limit(1);
    report(
      "1. SELECT anônimo em 'dias_off' deve funcionar",
      error === null,
      error ? `Erro inesperado: ${JSON.stringify(error)}` : `OK — select aceito (${data?.length ?? 0} linha(s) na amostra).`
    );
  }

  // 2. INSERT anônimo deve ser bloqueado.
  {
    const { error } = await anon.from("dias_off").insert({ data: dataTeste });
    const { data: check } = await admin.from("dias_off").select("id").eq("data", dataTeste).maybeSingle();
    const bloqueado = !check;
    report(
      "2. INSERT anônimo em 'dias_off' deve ser bloqueado",
      bloqueado,
      bloqueado
        ? `OK — nenhum registro criado${error ? ` (insert também retornou erro: ${error.message})` : " (insert foi aceito sem erro, mas não criou linha — inesperado, mas ainda seguro)"}.`
        : `FALHA — o anônimo conseguiu inserir o dia off ${dataTeste}.`
    );
  }

  // 3. DELETE anônimo deve ser bloqueado (usando um registro criado via
  // service role, já que o anônimo não conseguiu criar nada acima).
  {
    await admin.from("dias_off").insert({ data: dataTeste });
    const { error } = await anon.from("dias_off").delete().eq("data", dataTeste);
    const { data: check } = await admin.from("dias_off").select("id").eq("data", dataTeste).maybeSingle();
    const bloqueado = !!check;
    report(
      "3. DELETE anônimo em 'dias_off' deve ser bloqueado",
      bloqueado,
      bloqueado
        ? `OK — o dia off ${dataTeste} continua na tabela${error ? ` (delete também retornou erro: ${error.message})` : " (delete foi aceito sem erro, mas não apagou nenhuma linha)"}.`
        : `FALHA — o anônimo apagou o dia off ${dataTeste}.`
    );
    // Limpa o registro semeado via service role antes dos testes autenticados.
    await admin.from("dias_off").delete().eq("data", dataTeste);
  }

  // Estabelece uma sessão autenticada de verdade para os testes 4-6.
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: testAdminEmail,
  });

  if (linkError || !linkData?.properties?.hashed_token) {
    report(
      "4-6. Testes autenticados",
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
      report("4-6. Testes autenticados", false, `Falha ao trocar o magic link por sessão: ${verifyError.message}`);
    } else {
      // 4. INSERT autenticado deve funcionar.
      const { data: insertedData, error: insertError } = await authed
        .from("dias_off")
        .insert({ data: dataTeste })
        .select("id")
        .single();
      report(
        "4. INSERT autenticado em 'dias_off' deve funcionar",
        insertError === null && !!insertedData,
        insertError ? `Erro inesperado: ${JSON.stringify(insertError)}` : `OK — dia off ${dataTeste} criado (id ${insertedData?.id}).`
      );

      // 5. SELECT autenticado deve enxergar o registro recém-criado.
      const { data: selectData, error: selectError } = await authed.from("dias_off").select("id").eq("data", dataTeste);
      report(
        "5. SELECT autenticado em 'dias_off' deve enxergar o registro criado",
        selectError === null && (selectData?.length ?? 0) === 1,
        selectError ? `Erro inesperado: ${JSON.stringify(selectError)}` : `OK — ${selectData?.length ?? 0} linha(s) retornada(s).`
      );

      // 6. DELETE autenticado deve funcionar (limpa o registro de teste).
      const { error: deleteError } = await authed.from("dias_off").delete().eq("data", dataTeste);
      const { data: afterDelete } = await admin.from("dias_off").select("id").eq("data", dataTeste).maybeSingle();
      const deleteOk = deleteError === null && !afterDelete;
      report(
        "6. DELETE autenticado em 'dias_off' deve funcionar",
        deleteOk,
        deleteError
          ? `Erro inesperado: ${JSON.stringify(deleteError)}`
          : deleteOk
            ? `OK — dia off de teste ${dataTeste} removido.`
            : `FALHA — o dia off ${dataTeste} ainda existe depois do delete.`
      );

      await authed.auth.signOut();
    }
  }

  console.log("\n" + "=".repeat(70));
  const failed = results.filter((r) => !r.passed);
  console.log(`\nResumo: ${results.length - failed.length}/${results.length} testes passaram.`);

  if (failed.length > 0) {
    console.log("Falharam:", failed.map((f) => f.name).join(", "));
    // Limpa qualquer resíduo de teste via service role, mesmo em caso de falha.
    await admin.from("dias_off").delete().eq("data", dataTeste);
    process.exit(1);
  }
}

main().catch(async (err) => {
  console.error("Erro inesperado ao rodar os testes:", err);
  process.exit(1);
});
