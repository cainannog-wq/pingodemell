import { ButtonLink, Icon } from "@/components/ds";
import { Hive } from "@/components/site/Hive";
import { ROTAS } from "@/lib/site/rotas";

// Conteúdo da 404 do site, sem cabeçalho e rodapé. Usado em dois lugares:
// - app/not-found.tsx (endereço que não existe): fica fora do layout do
//   site público, então monta o SiteChrome em volta;
// - app/(site)/not-found.tsx (notFound() de uma página do site, como a
//   interna de produto inativo): já está dentro do layout, que monta o
//   SiteChrome — montar de novo duplicaria cabeçalho e rodapé.
export function PaginaNaoEncontrada() {
  return (
    // data-pagina-404: o GA4 manda o caminho fixo /404, nunca o endereço
    // digitado (src/lib/analitica/gtag.ts).
    <section className="site-simple" data-pagina-404="">
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
  );
}
