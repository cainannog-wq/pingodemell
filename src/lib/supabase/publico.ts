import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseUrl } from "./env";

// Cliente anônimo, sem sessão nem cookie: lê só o que a RLS libera para o
// público (produto ativo, sabores, recheio ativo). Para leitura pública que
// não depende de quem está navegando, como o sitemap.
export function createPublicClient() {
  return createSupabaseClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
