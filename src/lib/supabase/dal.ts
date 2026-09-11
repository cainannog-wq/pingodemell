import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./server";

// Memoizado por render: várias chamadas na mesma requisição batem o Supabase
// uma única vez.
export const getAuthenticatedUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

// Use em toda Server Action e página do admin que exige login.
// Nunca confie apenas em esconder a UI: isso só garante o acesso real.
export async function requireAuth() {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}
