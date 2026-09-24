import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./env";

// Cliente com a service role key — ignora RLS. Só deve ser chamado a
// partir de código que roda no servidor (Route Handlers, Server Actions):
// SUPABASE_SERVICE_ROLE_KEY não é exposta ao navegador (não está no `env`
// de next.config.ts), então importar isto num Client Component quebra em
// runtime, não só por convenção. Marcado com "server-only": o build falha
// se algum Client Component importar este módulo, direta ou indiretamente.
//
// Usos: rate limit de POST /api/pedidos (tabela pedidos_rate_limit, sem
// policy nenhuma — só acessível via service role) e os arquivos da galeria
// de fotos extras no storage (src/lib/galeria/storage-servidor.ts): o admin
// logado não enxerga storage.objects (não existe política de SELECT no
// bucket), então não consegue listar nem apagar arquivo com a própria sessão.
export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("Missing environment variable: SUPABASE_SERVICE_ROLE_KEY");
  }

  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
