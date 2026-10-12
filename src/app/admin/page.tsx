import { connection } from "next/server";
import { requireAuth } from "@/lib/supabase/dal";
import { lerUrlRelatorio } from "@/lib/admin/relatorio";
import { QuadroRelatorio } from "./quadro-relatorio";

// Primeira tela do admin: o relatório de visitas. A sessão é checada aqui,
// na própria página (o layout não roda de novo na navegação entre páginas), e
// só depois a URL é lida. connection() tira a página do build: sem ela, um
// build com a variável preenchida poderia gravar a URL em HTML estático.
export default async function AdminInicioPage() {
  await requireAuth();
  await connection();
  return <QuadroRelatorio url={lerUrlRelatorio()} />;
}
