import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAnonKey, supabaseUrl } from "./env";

// Cliente para uso em Server Components, Server Actions e Route Handlers.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // setAll foi chamado a partir de um Server Component sem
          // middleware de refresh de sessão — pode ser ignorado se houver
          // middleware cuidando da renovação da sessão do usuário.
        }
      },
    },
  });
}
