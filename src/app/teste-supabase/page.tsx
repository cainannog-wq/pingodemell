import { createClient } from "@/lib/supabase/server";

export default async function TesteSupabasePage() {
  const supabase = await createClient();
  const { data: produtos, error } = await supabase
    .from("produtos")
    .select("*")
    .limit(10);

  return (
    <div style={{ padding: 32, fontFamily: "sans-serif" }}>
      <h1>Teste de conexão Supabase</h1>

      {error && (
        <div style={{ color: "crimson" }}>
          <p>Erro ao consultar a tabela &quot;produtos&quot;:</p>
          <pre>{JSON.stringify(error, null, 2)}</pre>
        </div>
      )}

      {!error && (
        <>
          <p style={{ color: "green" }}>
            Conexão bem-sucedida. {produtos?.length ?? 0} produto(s) retornado(s).
          </p>
          <pre>{JSON.stringify(produtos, null, 2)}</pre>
        </>
      )}
    </div>
  );
}
