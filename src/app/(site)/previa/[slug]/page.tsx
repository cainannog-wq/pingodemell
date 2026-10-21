import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { buscarInternaPrevia } from "@/lib/vitrine/buscar";
import { CorpoDaInterna } from "../../produtos/[slug]/_interna/CorpoDaInterna";

// Prévia do admin: a interna de um kit por pessoa como a cliente a veria,
// mesmo inativo, para a Taami e o Cainan conferirem antes de ativar. Regras:
// - só com sessão de admin (requireAuth manda para /login; sem sessão o
//   conteúdo nunca é montado), lida com o cliente COM sessão e SEM cache:
//   nada daqui entra no cache da vitrine, que é público;
// - só produto do tipo kit_pessoa (qualquer outro, ou slug inexistente, é 404),
//   ativo ou não: a RLS do logado enxerga o inativo, a do anônimo nunca;
// - o botão de adicionar fica desligado (kit inativo não entra em pedido);
// - nunca indexável (meta e X-Robots-Tag), e fora do sitemap e da Lista.
// A produção não ganha acesso novo: o inativo continua invisível para o
// público (a vitrine lê sempre sem sessão) e esta rota exige login.

type Props = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Prévia do kit · Pingo de Mell",
  robots: { index: false, follow: false },
};

export default async function PreviaDoKit({ params }: Props) {
  await requireAuth();
  const { slug } = await params;
  const supabase = await createClient();
  const previa = await buscarInternaPrevia(slug, supabase);
  if (previa.estado === "nao-encontrado") notFound();
  if (previa.estado === "erro") throw new Error("Falha ao montar a prévia do kit.");

  const { produto } = previa.interna;
  const status = produto.ativo ? "ativo" : "inativo";
  return (
    <>
      <p className="site-container" role="status" data-previa-do-admin style={{ margin: "16px auto", fontWeight: 600 }}>
        Prévia do admin: kit {status}. Só quem está logado vê esta página, e ela não vai para o Google.
      </p>
      <CorpoDaInterna
        interna={previa.interna}
        maisPedidos={[]}
        previa
        avisoDaPrevia={
          previa.kitCompleto
            ? null
            : "Este kit ainda não tem nenhum tamanho completo (cada grupo precisa de quantidade para o tamanho). A tela da cliente só aparece quando houver."
        }
      />
    </>
  );
}
