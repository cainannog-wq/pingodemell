import type { Metadata } from "next";
import { ButtonLink, Icon } from "@/components/ds";
import { Hive } from "@/components/site/Hive";
import { SiteChrome } from "@/components/site/SiteChrome";
import { ROTAS } from "@/lib/site/rotas";

// 404 própria do site: toda rota inexistente cai aqui (inclusive as páginas
// que ainda vão ser construídas, como /produtos e /quem-somos), com o
// cabeçalho e o rodapé do site público.
export const metadata: Metadata = {
  title: "Página não encontrada · Pingo de Mell",
};

export default function NotFound() {
  return (
    <SiteChrome>
      <section className="site-simple">
        <Hive />
        <div className="site-container site-simple-inner">
          <Icon name="cake" size={48} color="var(--gold-400)" />
          <h1>Essa página não existe</h1>
          <p className="site-simple-lead">
            O endereço pode ter mudado ou estar digitado errado. Que tal voltar pro começo ou dar uma olhada nos produtos?
          </p>
          <div className="site-simple-ctas">
            <ButtonLink href={ROTAS.home} variant="primary" size="lg" iconLeft="home">
              Voltar para a Home
            </ButtonLink>
            <ButtonLink href={ROTAS.lista} variant="secondary" size="lg" iconRight="arrow_forward">
              Ver produtos
            </ButtonLink>
          </div>
        </div>
      </section>
    </SiteChrome>
  );
}
