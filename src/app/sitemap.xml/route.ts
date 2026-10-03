import { SITE_INDEXAVEL } from "@/lib/site/indexacao";
import { montarSitemap } from "@/lib/site/sitemap";
import { createPublicClient } from "@/lib/supabase/publico";
import { dependencias } from "@/lib/vitrine/buscar";
import { semIndisponiveis } from "@/lib/vitrine/disponibilidade";
import { CAMPOS_VITRINE, type ProdutoVitrine } from "@/lib/vitrine/mais-pedidos";

// Sitemap (PR fase4/seo-metadados). Com SITE_INDEXAVEL false responde 404
// sem consultar o banco: o site está fora dos buscadores e o robots.txt não
// aponta para cá.
//
// Dinâmico: cada pedido monta o sitemap na hora, sempre igual ao catálogo,
// sem consulta ao banco durante o build; quem pede é só robô de busca, então
// o custo é desprezível.
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  if (!SITE_INDEXAVEL) return new Response("Not Found", { status: 404 });

  // Cliente anônimo, sem sessão: o filtro de ativo vale na consulta e no
  // código (como na vitrine).
  const supabase = createPublicClient();
  const { data, error } = await supabase.from("produtos").select(CAMPOS_VITRINE).eq("ativo", true);
  if (error) {
    console.error("Falha ao buscar os produtos do sitemap:", error.message);
    return new Response("Service Unavailable", { status: 503 });
  }

  const ativos = ((data ?? []) as ProdutoVitrine[]).filter((p) => p.ativo === true);
  const dep = await dependencias(supabase, ativos);
  if (!dep) return new Response("Service Unavailable", { status: 503 });

  return new Response(montarSitemap(semIndisponiveis(ativos, dep.comSabor, dep.recheios)), {
    status: 200,
    headers: { "Content-Type": "application/xml" },
  });
}
