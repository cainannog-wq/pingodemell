import { SANDBOX_RELATORIO } from "@/lib/admin/relatorio";

// Quadro do relatório de visitas. Server Component de propósito: a URL fica
// só no HTML da resposta de quem tem sessão e não entra em nenhum arquivo
// JavaScript do navegador (nada de componente de cliente aqui). O iframe usa
// carregamento tardio, então o menu e o resto da página não esperam por ele.
export function QuadroRelatorio({ url }: { url: string | null }) {
  if (!url) {
    return (
      <div className="admin-relatorio-vazio" role="status">
        O relatório não está disponível agora.
      </div>
    );
  }
  return (
    <>
      <div className="admin-relatorio-moldura">
        <iframe
          className="admin-relatorio-frame"
          src={url}
          title="Relatório de visitas do site"
          loading="lazy"
          referrerPolicy="no-referrer"
          sandbox={SANDBOX_RELATORIO}
          allowFullScreen
        />
      </div>
      <p className="admin-relatorio-nota">Se o relatório não aparecer, recarregue a página.</p>
    </>
  );
}
