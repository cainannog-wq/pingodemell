import { createBrowserClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "./env";

// Cliente para uso em Client Components ("use client").
export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
