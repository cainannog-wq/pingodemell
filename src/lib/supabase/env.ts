function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

export const supabaseUrl = requireEnv("SUPABASE_URL", process.env.SUPABASE_URL);
export const supabaseAnonKey = requireEnv(
  "SUPABASE_ANON_KEY",
  process.env.SUPABASE_ANON_KEY
);
